import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { analyticsController } from './analytics.controller';
import {
  batchIdParamsSchema,
  getBatchPerformanceQuerySchema,
  type BatchIdParams,
  type GetBatchPerformanceQuery,
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
}

export default analyticsRoutes;
