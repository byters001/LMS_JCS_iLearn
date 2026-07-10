import type { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../logger';
import { redisClient } from '../redis/client';
import { idempotencyKey } from '../redis/keys';
import {
  ConflictError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from '../shared/errors/app-error';

// --- Design (CLAUDE.md non-negotiable #4) ---
//
// A client sends an `Idempotency-Key` header on a mutating request. On
// first receipt, the request executes normally and its outcome (HTTP
// status + response body) is cached against that key in Redis. On a
// REPEAT request with the same key, the cached outcome is returned
// immediately, without the route handler (and therefore its business
// logic — burning an attempt_number, double-scoring a response, etc.)
// ever running again.
//
// Key scope: `idempotency:{userId}:{method}:{route}:{clientKey}` (built by
// redis/keys.ts's idempotencyKey). Two requirements drove this:
//   - Per-user (explicitly required): the same literal key value chosen by
//     two different users must never collide — scoping by request.user.id
//     (set by fastify.authenticate, which must run before this hook).
//   - Per-route+method (an addition beyond the literal ask, deliberate,
//     zero downside): a client accidentally reusing the same key value
//     across two unrelated endpoints (e.g. the same UUID sent to both
//     POST /attempts and PUT .../responses/:id) would otherwise let one
//     operation's cached outcome bleed into an unrelated one. Route
//     template (request.routeOptions.url, not the raw URL with real
//     param values) plus method closes that off entirely, at no cost to
//     a well-behaved client that already generates a fresh key per
//     logical operation.
//
// TTL: 24 hours. Long enough to cover realistic retry/reconnect windows —
// a student's device losing connectivity mid-submit (spotty campus wifi,
// backgrounded app) and retrying hours later should still hit the cached
// outcome, not double-submit. Short enough not to bloat Redis forever —
// this is a bounded, self-expiring cache, not permanent state; a request
// with the same key arriving a day later is treated as new, which is fine
// since no reasonable client retry strategy waits that long. 24h also
// matches the well-established industry default for this exact mechanism
// (e.g. Stripe's own Idempotency-Key TTL), not an arbitrary pick.
//
// Redis outage behavior: FAILS CLOSED at the claim step (see preHandler
// below) — a Redis outage throws ServiceUnavailableError rather than
// silently letting the mutation through unguarded. This matches this
// codebase's existing precedent (rbac/permission-cache.ts's fail-closed
// behavior, and CLAUDE.md's own "Redis outage behavior" section) rather
// than inventing a new fail-open exception for this one mechanism.
//
// Two-state record per key, so a genuine concurrent race (two requests
// with the same key arriving before either has finished) is distinguished
// from "the earlier request already finished":
//   - {"status":"in_progress"} — written via SET NX at claim time. A
//     second request that finds this (SET NX failed, GET still shows
//     in_progress) gets 409 Conflict — it must NOT proceed and must NOT
//     silently wait, since there's no cheap way to block-and-poll here
//     without adding new infrastructure beyond what's asked for.
//   - {"status":"completed","httpStatus":n,"body":...} — written by
//     persistIdempotentOutcome (a preSerialization hook) once the route
//     handler actually finishes. A later request with the same key
//     replays this exact status+body without the handler running again.
// On a 5xx from the handler, the claim is DELETED instead of cached as
// "completed" — a transient/server-side failure shouldn't leave a retry
// stuck replaying that same 500 for the rest of the TTL; only
// deterministic outcomes (2xx and 4xx business-logic results) are cached.
//
// NOT built here (deliberately, matching the literal ask): request-body
// fingerprinting to detect a key being reused for a logically different
// payload (Stripe does this; a reasonable follow-up, not required by the
// "execute once, replay on repeat" behavior actually requested here).

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const IDEMPOTENCY_HEADER = 'idempotency-key';

type IdempotencyRecord =
  | { status: 'in_progress' }
  | { status: 'completed'; httpStatus: number; body: unknown };

declare module 'fastify' {
  interface FastifyRequest {
    // Set only when THIS request freshly claimed its Idempotency-Key (i.e.
    // it is not a cache replay) — persistIdempotentOutcome uses this to
    // know whether there's anything to write back.
    idempotencyClaimKey?: string;
  }
}

export interface IdempotencyHooks {
  preHandler: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  preSerialization: (request: FastifyRequest, reply: FastifyReply, payload: unknown) => Promise<unknown>;
}

export interface IdempotencyOptions {
  // Required (the default) vs optional-but-honored is a real product
  // choice — see routes.ts callers for which one applies where and why.
  required?: boolean;
}

// Factory (not a bare pair of module-level functions) so different routes
// can choose required-vs-optional independently, mirroring
// rbac/require-permission.ts's requirePermission(key) factory shape — the
// established pattern in this codebase for a configurable, reusable
// preHandler.
export function idempotency(options: IdempotencyOptions = {}): IdempotencyHooks {
  const required = options.required ?? true;

  async function preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const headerValue = request.headers[IDEMPOTENCY_HEADER];
    const clientKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!clientKey) {
      if (required) {
        throw new ValidationError(`${IDEMPOTENCY_HEADER} header is required`);
      }
      return;
    }

    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const route = request.routeOptions.url ?? request.url;
    const redisKey = idempotencyKey(request.user.id, request.method, route, clientKey);

    let claimed: 'OK' | null;
    try {
      claimed = await redisClient.set(
        redisKey,
        JSON.stringify({ status: 'in_progress' } satisfies IdempotencyRecord),
        'EX',
        IDEMPOTENCY_TTL_SECONDS,
        'NX',
      );
    } catch (err) {
      logger.error({ err }, 'Idempotency-Key claim failed: Redis unreachable');
      throw new ServiceUnavailableError('Idempotency check temporarily unavailable');
    }

    if (claimed === 'OK') {
      // Fresh claim — this request will actually run the handler;
      // preSerialization persists the outcome once it's known.
      request.idempotencyClaimKey = redisKey;
      return;
    }

    // Key already exists: either a completed result to replay, or a
    // genuine concurrent race still being handled.
    let raw: string | null;
    try {
      raw = await redisClient.get(redisKey);
    } catch (err) {
      logger.error({ err }, 'Idempotency-Key lookup failed: Redis unreachable');
      throw new ServiceUnavailableError('Idempotency check temporarily unavailable');
    }

    const record: IdempotencyRecord | null = raw ? JSON.parse(raw) : null;
    if (record?.status === 'completed') {
      reply.status(record.httpStatus).send(record.body);
      return;
    }

    // Either still 'in_progress', or the key expired in the narrow window
    // between the failed NX and this GET — both are safest treated as "a
    // request with this key is already/was just being handled," not as
    // "safe to proceed," since silently proceeding is exactly the
    // double-execution this mechanism exists to prevent.
    throw new ConflictError('A request with this Idempotency-Key is already being processed');
  }

  async function preSerialization(
    request: FastifyRequest,
    reply: FastifyReply,
    payload: unknown,
  ): Promise<unknown> {
    if (!request.idempotencyClaimKey) {
      // Either no key was sent (optional + absent) or this response IS
      // the cache replay itself (already sent directly from preHandler,
      // via reply.send() above) — nothing to persist either way.
      return payload;
    }

    const httpStatus = reply.statusCode;
    try {
      if (httpStatus >= 500) {
        // Transient/server failure — release the claim so a genuine retry
        // isn't stuck replaying this 500 for the rest of the TTL.
        await redisClient.del(request.idempotencyClaimKey);
      } else {
        await redisClient.set(
          request.idempotencyClaimKey,
          JSON.stringify({
            status: 'completed',
            httpStatus,
            body: payload,
          } satisfies IdempotencyRecord),
          'EX',
          IDEMPOTENCY_TTL_SECONDS,
        );
      }
    } catch (err) {
      // Don't fail an already-computed response just because the cache
      // write failed — the mutation already happened; the client should
      // still get their real answer. Worst case: the claim is left
      // dangling as 'in_progress' until its TTL naturally expires, which
      // BLOCKS retries with this same key for up to 24h rather than
      // risking a double-execution — a conservative failure mode,
      // consistent with this file's fail-closed preHandler.
      logger.error({ err }, 'Idempotency-Key: failed to persist outcome');
    }

    return payload;
  }

  return { preHandler, preSerialization };
}
