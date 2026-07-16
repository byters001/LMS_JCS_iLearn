import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { redisClient } from '../redis/client';

// Raised from 100 -> 600 (confirmed root cause, live logs): this plugin is
// registered as a global onRequest hook (see app.ts's registration order),
// which fires BEFORE fastify.authenticate — that decorator only runs as a
// per-route preHandler, one lifecycle stage later. So request.user is never
// populated yet when @fastify/rate-limit's default keyGenerator runs, and
// this limit has only ever keyed on request.ip, for every route including
// unauthenticated ones — there is no separate "authenticated" tier today,
// despite the module comment below describing one for submit routes only.
// A per-user tier isn't wired here for the same reason: doing it properly
// would mean moving auth verification earlier (into an onRequest hook) app-
// wide, which is a real architectural change, not a rate-limit tuning pass.
//
// 600/min per IP (10 req/s) is sized for the realistic worst case, not the
// average: this app's users are trainers/admins at partner colleges (see
// CLAUDE.md's opening line) who may share one NAT'd office IP, an admin
// dashboard page can mount 5-15 independent widget queries at once, and
// TanStack Query still refires every mounted query on remount/navigation
// even after the refetchOnWindowFocus fix (App.tsx) cuts the tab-switch
// case specifically. 600 gives ~6x headroom over the old ceiling that was
// empirically exhausted, while still bounding a genuine runaway loop or
// scripted abuse (sustained 10 req/s for a full minute is well past normal
// click-driven dashboard use even with several staff behind one IP).
//
// This general limit is intentionally NOT applied to /auth/login — see
// LOGIN_RATE_LIMIT_CONFIG below, attached directly on that route in
// auth.routes.ts, since login is the one endpoint here with a real
// brute-force/credential-stuffing motive and no other defense (no account
// lockout exists anywhere in modules/auth) — raising the general ceiling
// must not also loosen that.
const GLOBAL_RATE_LIMIT_MAX = 600;
const GLOBAL_RATE_LIMIT_WINDOW = '1 minute';

export default fp(async function rateLimitPlugin(fastify: FastifyInstance) {
  // redis: redisClient — shares rate-limit counters across server instances
  // via the same Redis already used for the permission cache and refresh
  // token revocation, instead of @fastify/rate-limit's default in-memory
  // LRU store (which would give every instance its own independent budget,
  // silently multiplying the effective limit in a multi-instance deployment).
  await fastify.register(rateLimit, {
    max: GLOBAL_RATE_LIMIT_MAX,
    timeWindow: GLOBAL_RATE_LIMIT_WINDOW,
    redis: redisClient,
  });
});

// --- Login-specific override (stays strict) ---
//
// 10/min per IP: tight enough to blunt credential-stuffing/brute-force
// attempts (the only defense this endpoint has — no lockout/backoff exists
// in auth.service.ts), generous enough that a handful of genuine mistyped-
// password retries, or a couple of staff sharing an office IP both trying
// to log in around the same time, don't get needlessly blocked. Attached
// via Fastify's per-route `config: { rateLimit: {...} }` override in
// auth.routes.ts, which layers on top of (doesn't replace) the plugin
// registration above — same pattern as ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG
// below.
export const LOGIN_RATE_LIMIT_CONFIG = {
  max: 10,
  timeWindow: '1 minute',
};

// --- Reusable config for the future attempts/coding submit routes ---
//
// CLAUDE.md requires attempts and coding submit routes to be rate-limited
// per-assessment/session, not just per-IP — but neither modules/attempts nor
// modules/coding exists yet (this phase is explicitly scoped to plugins/
// middleware only). So this plugin can't wire an actual route; it can only
// export a keyGenerator + config object for those route files to import and
// attach via Fastify's per-route `config: { rateLimit: {...} }` override
// once they're built.
//
// The param names below (assessmentId, sessionId, attemptId) are a guess
// based on schema.sql's assessment_attempts / training_sessions tables —
// nothing currently registers routes shaped like `/assessments/:assessmentId/...`
// or `/attempts/:attemptId/...`, so these are unconfirmed. Whoever builds
// attempts.routes.ts / coding.routes.ts should verify the real param name
// matches one of these (or add it) before relying on this key actually
// scoping by assessment rather than silently falling back to per-IP.
export function assessmentScopedKeyGenerator(request: FastifyRequest): string {
  const params = request.params as Record<string, string | undefined>;
  const scopeId = params.assessmentId ?? params.sessionId ?? params.attemptId;
  const userId = request.user?.id ?? 'anonymous';

  return scopeId ? `assessment:${scopeId}:user:${userId}` : request.ip;
}

export const ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG = {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: assessmentScopedKeyGenerator,
};
