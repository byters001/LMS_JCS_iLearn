import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
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
export async function attemptsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: StartAttemptInput }>(
    '/attempts',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateBody(startAttemptSchema),
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
      preHandler: [fastify.authenticate],
      preValidation: [
        validateParams(attemptResponseParamsSchema),
        validateBody(submitResponseSchema),
      ],
      config: { rateLimit: ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG },
    },
    attemptsController.submitResponse,
  );

  // Same per-attempt rate limit as the responses route above. NOTE:
  // CLAUDE.md's non-negotiable #4 (Idempotency-Key, Redis-backed) is NOT
  // implemented on this route — no Idempotency-Key middleware exists
  // anywhere in this codebase yet. finalizeAttempt's WHERE status =
  // 'in_progress' guard (attempts.repository.ts) structurally prevents a
  // double-submit from double-scoring, but that's not the same guarantee
  // as replaying the exact cached response for a literal retry. Flagged
  // here rather than silently left off.
  fastify.post<{ Params: AttemptIdParams }>(
    '/attempts/:attemptId/submit',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateParams(attemptIdParamsSchema),
      config: { rateLimit: ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG },
    },
    attemptsController.submitAttempt,
  );
}

export default attemptsRoutes;
