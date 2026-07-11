import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

export const batchIdParamsSchema = z
  .object({
    batchId: z.string().uuid('batchId must be a valid UUID'),
  })
  .strict();

// assessmentId is optional — see analytics.service.ts's module comment
// for exactly what "no assessmentId" defaults to.
export const getBatchPerformanceQuerySchema = z
  .object({
    assessmentId: z.string().uuid('assessmentId must be a valid UUID').optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();

export type BatchIdParams = z.infer<typeof batchIdParamsSchema>;
export type GetBatchPerformanceQuery = z.infer<typeof getBatchPerformanceQuerySchema>;
