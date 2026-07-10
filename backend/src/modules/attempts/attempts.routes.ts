import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { idempotency } from '../../plugins/idempotency.plugin';
import { ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG } from '../../plugins/rate-limit.plugin';
import { ValidationError } from '../../shared/errors/app-error';
import { attemptsController } from './attempts.controller';
import {
  attemptIdParamsSchema,
  attemptResponseParamsSchema,
  listMyAttemptsQuerySchema,
  startAttemptSchema,
  submitResponseSchema,
  type AttemptIdParams,
  type AttemptResponseParams,
  type ListMyAttemptsQuery,
  type StartAttemptInput,
  type SubmitResponseInput,
} from './attempts.schema';

function validateQuery(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query parameters', parsed.error.flatten());
    }
    request.query = parsed.data;
  };
}

function validateParams(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid route parameters', parsed.error.flatten());
    }
    request.params = parsed.data;
  };
}

function validateBody(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    request.body = parsed.data;
  };
}

// --- Permission model (item 6) ---
// No requirePermission() anywhere in this file, deliberately — see
// attempts.service.ts's module comment for the full reasoning. Every route
// here is gated by fastify.authenticate ONLY (a valid JWT); authorization
// is self-ownership, enforced in the service layer (requireStudentProfile +
// assertOwnsAttempt), because schema.sql seeds the 'student' role with ZERO
// permission keys — requirePermission(<anything>) would reject every
// student unconditionally, and there's no precedent in this codebase for
// granting students a permission key to work around that.

// --- Idempotency-Key (CLAUDE.md non-negotiable #4) ---
// One shared instance, reused across all three mutating routes below —
// idempotency()'s returned hooks hold no per-route state of their own
// (everything they need lives on `request` per-call), so a single
// `{ required: true }` pair is safe to attach to multiple routes. REQUIRED
// (not optional-but-honored) on all three: CLAUDE.md's own wording already
// says this is "required" on the attempts submit route, and these three
// specifically are the ones where a silently-missing key would let the
// exact failure this mechanism exists to prevent slip through unguarded —
// starting an attempt burns a scarce attempt_number, submitting a response
// can double-score, and finalizing an attempt is a one-way transition.
// Making the header mandatory is stricter (any client that forgets to send
// it gets a clear 400 instead of a silent gap), which is the right
// trade-off for this class of "payment-like" mutation — optional-but-
// honored would only protect callers who remembered to opt in, leaving
// every other caller exactly as unprotected as before this phase.
const attemptIdempotency = idempotency({ required: true });

export async function attemptsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: StartAttemptInput }>(
    '/attempts',
    {
      preHandler: [fastify.authenticate, attemptIdempotency.preHandler],
      preValidation: validateBody(startAttemptSchema),
      preSerialization: [attemptIdempotency.preSerialization],
    },
    attemptsController.startAttempt,
  );

  // Self-scoped list — see attempts.service.ts's listMyAttempts.
  fastify.get<{ Querystring: ListMyAttemptsQuery }>(
    '/attempts',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateQuery(listMyAttemptsQuerySchema),
    },
    attemptsController.listMyAttempts,
  );

  fastify.get<{ Params: AttemptIdParams }>(
    '/attempts/:attemptId',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateParams(attemptIdParamsSchema),
    },
    attemptsController.getAttemptById,
  );

  // Reads attempt_question_selections only — never re-resolves live. See
  // attempts.service.ts's getAttemptQuestions.
  fastify.get<{ Params: AttemptIdParams }>(
    '/attempts/:attemptId/questions',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateParams(attemptIdParamsSchema),
    },
    attemptsController.getAttemptQuestions,
  );

  // Rate-limited per-attempt (CLAUDE.md non-negotiable #7: attempts submit
  // routes scoped per assessment/session, not just per-IP) —
  // ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG's keyGenerator falls back through
  // params.assessmentId ?? params.sessionId ?? params.attemptId, and this
  // route's param is named :attemptId to match that fallback chain (see
  // rate-limit.plugin.ts's own comment flagging this param name as
  // unconfirmed until whoever built this route verified it — confirmed
  // here).
  fastify.put<{ Params: AttemptResponseParams; Body: SubmitResponseInput }>(
    '/attempts/:attemptId/responses/:questionVersionId',
    {
      preHandler: [fastify.authenticate, attemptIdempotency.preHandler],
      preValidation: [
        validateParams(attemptResponseParamsSchema),
        validateBody(submitResponseSchema),
      ],
      preSerialization: [attemptIdempotency.preSerialization],
      config: { rateLimit: ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG },
    },
    attemptsController.submitResponse,
  );

  // Same per-attempt rate limit as the responses route above, plus
  // Idempotency-Key (see the module comment above attemptsRoutes) — this
  // is literally "the attempts submit route" CLAUDE.md's non-negotiable #4
  // names by description. finalizeAttempt's WHERE status = 'in_progress'
  // guard (attempts.repository.ts) still independently prevents a
  // double-submit from double-scoring at the DB level; this adds the
  // actual replay-the-cached-response guarantee on top of that.
  fastify.post<{ Params: AttemptIdParams }>(
    '/attempts/:attemptId/submit',
    {
      preHandler: [fastify.authenticate, attemptIdempotency.preHandler],
      preValidation: validateParams(attemptIdParamsSchema),
      preSerialization: [attemptIdempotency.preSerialization],
      config: { rateLimit: ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG },
    },
    attemptsController.submitAttempt,
  );
}

export default attemptsRoutes;
