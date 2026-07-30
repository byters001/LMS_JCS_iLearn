import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { reportsController } from './reports.controller';
import {
  attemptIdParamsSchema,
  listMyAttemptsQuerySchema,
  staffAttemptParamsSchema,
  type AttemptIdParams,
  type ListMyAttemptsQuery,
  type StaffAttemptParams,
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
// No requirePermission() on the three self-service routes below,
// deliberately — see reports.service.ts's module comment for the full
// reasoning. Those are gated by fastify.authenticate ONLY (a valid JWT);
// authorization is self-ownership, enforced in the service layer
// (requireStudentProfileId + a studentId comparison on the detail
// route), same precedent as attempts.routes.ts.
//
// The staff attempt-detail route further down IS gated by
// requirePermission('analytics.view') — the exact same key
// analytics.routes.ts's ANALYTICS_VIEW already uses for
// BatchPerformancePage's own endpoints, since this route only ever
// exists for the SAME staff audience, is reached FROM that same page,
// and the module comment above ("a hypothetical staff-facing endpoint
// would be a different design") already anticipated this stays a
// distinct, explicitly-gated route rather than being folded into the
// self-service authenticate-only model.
const ANALYTICS_VIEW = requirePermission('analytics.view');

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

  // Staff attempt detail (item: surface timeSpentSeconds to staff) — see
  // this file's own "Permission model" comment above for why this one
  // route breaks from the self-service-only pattern the rest of this file
  // follows. batchId is in the path (not just attemptId) because
  // reports.service.ts's getAttemptDetailForStaff needs it up front for
  // analyticsService.assertCanAccessBatch.
  fastify.get<{ Params: StaffAttemptParams }>(
    '/reports/batches/:batchId/attempts/:attemptId',
    {
      preHandler: [fastify.authenticate, ANALYTICS_VIEW],
      preValidation: validateParams(staffAttemptParamsSchema),
    },
    reportsController.getAttemptDetailForStaff,
  );
}

export default reportsRoutes;
