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

// CSV exports (BatchPerformancePage reports follow-up) — part (a)'s
// assessmentId is optional for the same reason getBatchPerformanceQuerySchema's
// is: omitted means "the batch's most recently active assessment," resolved
// server-side by getBatchPerformance itself. No page/pageSize here — the
// export always returns every student (see analytics.service.ts's
// exportBatchPerformanceCsv), not a paginated slice.
export const exportBatchPerformanceQuerySchema = z
  .object({
    assessmentId: z.string().uuid('assessmentId must be a valid UUID').optional(),
  })
  .strict();

export type BatchIdParams = z.infer<typeof batchIdParamsSchema>;
export type GetBatchPerformanceQuery = z.infer<typeof getBatchPerformanceQuerySchema>;
export type ExportBatchPerformanceQuery = z.infer<typeof exportBatchPerformanceQuerySchema>;
