import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { analyticsController } from './analytics.controller';
import {
  batchIdParamsSchema,
  batchIdQuerySchema,
  collegeIdQuerySchema,
  exportBatchPerformanceQuerySchema,
  getBatchPerformanceQuerySchema,
  proctoringActivityQuerySchema,
  type BatchIdParams,
  type BatchIdQuery,
  type CollegeIdQuery,
  type ExportBatchPerformanceQuery,
  type GetBatchPerformanceQuery,
  type ProctoringActivityQuery,
} from './analytics.schema';

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

// --- Permission (item 2) ---
// schema.sql seeds 'analytics.view' ('View analytics and reports') —
// confirmed still accurate by re-reading the seed directly, and confirmed
// it's granted to Faculty (their role_permissions grant list explicitly
// includes 'analytics.view' alongside 'attempts.reassign', not just
// Super Admin's blanket grant). This endpoint is explicitly staff-facing
// (item 2), unlike reports Part 1's self-service design — gated by this
// existing key; no new key invented, none needed.
const ANALYTICS_VIEW = requirePermission('analytics.view');

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: BatchIdParams; Querystring: GetBatchPerformanceQuery }>(
    '/analytics/batches/:batchId/performance',
    {
      preHandler: [fastify.authenticate, ANALYTICS_VIEW],
      preValidation: [
        validateParams(batchIdParamsSchema),
        validateQuery(getBatchPerformanceQuerySchema),
      ],
    },
    analyticsController.getBatchPerformance,
  );

  // item 10 part 1 — per-assessment participation ratios for one batch.
  // No query schema: unlike getBatchPerformance (assessmentId/page/
  // pageSize), this always returns every participation-eligible assessment
  // assigned to the batch in one unpaginated list (see analytics.
  // repository.ts's listAssessmentsAssignedToBatch comment — bounded by
  // how many assessments one batch is realistically assigned, same
  // "class-sized cohort, cheap enough" scale reasoning getBatchPerformance
  // itself already applies to its own per-batch aggregation).
  fastify.get<{ Params: BatchIdParams }>(
    '/analytics/batches/:batchId/assessments',
    {
      preHandler: [fastify.authenticate, ANALYTICS_VIEW],
      preValidation: [validateParams(batchIdParamsSchema)],
    },
    analyticsController.getBatchAssessmentParticipation,
  );

  // --- CSV exports (BatchPerformancePage reports follow-up) ---
  // Same ANALYTICS_VIEW gate as the read endpoints above — exporting is
  // read-only, no separate permission key invented.
  fastify.get<{ Params: BatchIdParams; Querystring: ExportBatchPerformanceQuery }>(
    '/analytics/batches/:batchId/performance/export',
    {
      preHandler: [fastify.authenticate, ANALYTICS_VIEW],
      preValidation: [
        validateParams(batchIdParamsSchema),
        validateQuery(exportBatchPerformanceQuerySchema),
      ],
    },
    analyticsController.exportBatchPerformanceCsv,
  );

  fastify.get<{ Params: BatchIdParams }>(
    '/analytics/batches/:batchId/summary-export',
    {
      preHandler: [fastify.authenticate, ANALYTICS_VIEW],
      preValidation: [validateParams(batchIdParamsSchema)],
    },
    analyticsController.exportBatchSummaryCsv,
  );

  // --- Super Admin platform analytics ---
  // Same ANALYTICS_VIEW gate as every other route in this file, PLUS an
  // explicit super_admin-only check inside each service function
  // (requireSuperAdmin) — analytics.view alone is also granted to Faculty,
  // but these three are cross-college aggregates, not batch-scoped, so
  // that permission alone isn't a tight enough gate here. See
  // analytics.service.ts's requireSuperAdmin for the full reasoning.

  fastify.get<{ Querystring: CollegeIdQuery }>(
    '/analytics/overview',
    {
      preHandler: [fastify.authenticate, ANALYTICS_VIEW],
      preValidation: [validateQuery(collegeIdQuerySchema)],
    },
    analyticsController.getPlatformOverview,
  );

  // No query schema — this comparison is inherently cross-college, so
  // there's nothing to scope it by (unlike overview/category-improvement,
  // which both accept an optional collegeId).
  fastify.get(
    '/analytics/college-performance',
    { preHandler: [fastify.authenticate, ANALYTICS_VIEW] },
    analyticsController.getCollegePerformance,
  );

  fastify.get<{ Querystring: CollegeIdQuery }>(
    '/analytics/category-improvement',
    {
      preHandler: [fastify.authenticate, ANALYTICS_VIEW],
      preValidation: [validateQuery(collegeIdQuerySchema)],
    },
    analyticsController.getCategoryImprovement,
  );

  // --- Faculty's own analytics (Phase 3) ---
  // Same ANALYTICS_VIEW gate, no extra role check needed at the route (or
  // service) level beyond it — these three are self-scoped by construction
  // (derived from the caller's own batch_trainers rows), a fundamentally
  // different security shape from the cross-college routes above. See
  // analytics.service.ts's own comment on getMyOverview/
  // getMyBatchPerformance/getMyCategoryImprovement.

  fastify.get<{ Querystring: BatchIdQuery }>(
    '/analytics/my-overview',
    {
      preHandler: [fastify.authenticate, ANALYTICS_VIEW],
      preValidation: [validateQuery(batchIdQuerySchema)],
    },
    analyticsController.getMyOverview,
  );

  // No query schema — inherently cross-batch, same reasoning as
  // college-performance above.
  fastify.get(
    '/analytics/my-batch-performance',
    { preHandler: [fastify.authenticate, ANALYTICS_VIEW] },
    analyticsController.getMyBatchPerformance,
  );

  fastify.get<{ Querystring: BatchIdQuery }>(
    '/analytics/my-category-improvement',
    {
      preHandler: [fastify.authenticate, ANALYTICS_VIEW],
      preValidation: [validateQuery(batchIdQuerySchema)],
    },
    analyticsController.getMyCategoryImprovement,
  );

  // --- Proctoring activity (Phase 2 dashboard correction) ---
  // Same ANALYTICS_VIEW gate, PLUS requireSuperAdmin inside the service
  // (cross-college, same shape as /analytics/overview above) — see
  // analytics.service.ts's getProctoringActivity for the full reasoning.
  fastify.get<{ Querystring: ProctoringActivityQuery }>(
    '/analytics/proctoring-activity',
    {
      preHandler: [fastify.authenticate, ANALYTICS_VIEW],
      preValidation: [validateQuery(proctoringActivityQuerySchema)],
    },
    analyticsController.getProctoringActivity,
  );
}

export default analyticsRoutes;
