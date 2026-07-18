import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../../shared/errors/app-error';
import { reportsController } from './reports.controller';
import {
  attemptIdParamsSchema,
  listMyAttemptsQuerySchema,
  type AttemptIdParams,
  type ListMyAttemptsQuery,
} from './reports.schema';

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

// --- Permission model (item 3) ---
// No requirePermission() anywhere in this file, deliberately — see
// reports.service.ts's module comment for the full reasoning. Both
// routes are gated by fastify.authenticate ONLY (a valid JWT);
// authorization is self-ownership, enforced in the service layer
// (requireStudentProfileId + a studentId comparison on the detail
// route), same precedent as attempts.routes.ts.
export async function reportsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: ListMyAttemptsQuery }>(
    '/reports/my-attempts',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateQuery(listMyAttemptsQuerySchema),
    },
    reportsController.listMyAttempts,
  );

  fastify.get<{ Params: AttemptIdParams }>(
    '/reports/my-attempts/:attemptId',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateParams(attemptIdParamsSchema),
    },
    reportsController.getMyAttemptDetail,
  );

  // No query/params schema — self-scoped entirely from the caller's JWT
  // (see reports.service.ts's getLeaderboard), same "authenticate only,
  // authorization via self-ownership in the service layer" model as the
  // two routes above.
  fastify.get(
    '/reports/leaderboard',
    { preHandler: [fastify.authenticate] },
    reportsController.getLeaderboard,
  );
}

export default reportsRoutes;
