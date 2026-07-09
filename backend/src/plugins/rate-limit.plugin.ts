import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { redisClient } from '../redis/client';

const GLOBAL_RATE_LIMIT_MAX = 100;
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
