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

// Super Admin platform-wide analytics (collegeId optional — omitted means
// platform-wide, matching the "no collegeId = global grant" convention this
// codebase already uses elsewhere, e.g. getAttendanceByDate). Shared by
// /analytics/overview and /analytics/category-improvement; /analytics/
// college-performance takes no query params at all (the comparison is
// inherently cross-college).
export const collegeIdQuerySchema = z
  .object({
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  })
  .strict();

// Faculty's own analytics (Phase 3) — batchId optional (omitted means
// "aggregate across every batch this caller is assigned to via
// batch_trainers", resolved server-side by analytics.service.ts's
// getMyOverview/getMyCategoryImprovement). Narrowing to one batch is
// authorized against the caller's OWN assignments there (assertCanAccessBatch,
// reused as-is) — this schema only validates shape, not ownership. Shared
// by /analytics/my-overview and /analytics/my-category-improvement;
// /analytics/my-batch-performance takes no query params, same
// "the comparison is inherently cross-batch" reasoning as
// collegeIdQuerySchema's own college-performance sibling.
export const batchIdQuerySchema = z
  .object({
    batchId: z.string().uuid('batchId must be a valid UUID').optional(),
  })
  .strict();

// --- Proctoring activity (Phase 2 dashboard correction) ---
// collegeId optional, same "omitted = platform-wide" convention as
// collegeIdQuerySchema above (a genuinely different schema, not a reuse,
// because this one also takes `days`). `days` bounds the lookback window —
// default 7 (matches the "Proctoring events logged (7d)" stat label),
// caller-adjustable up to 30 so the admin dashboard's date-range filter has
// something real to control, capped so this never turns into an unbounded
// full-table scan.
export const proctoringActivityQuerySchema = z
  .object({
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
    days: z.coerce.number().int().min(1).max(30).default(7),
  })
  .strict();

export type BatchIdParams = z.infer<typeof batchIdParamsSchema>;
export type GetBatchPerformanceQuery = z.infer<typeof getBatchPerformanceQuerySchema>;
export type ExportBatchPerformanceQuery = z.infer<typeof exportBatchPerformanceQuerySchema>;
export type CollegeIdQuery = z.infer<typeof collegeIdQuerySchema>;
export type BatchIdQuery = z.infer<typeof batchIdQuerySchema>;
export type ProctoringActivityQuery = z.infer<typeof proctoringActivityQuerySchema>;
