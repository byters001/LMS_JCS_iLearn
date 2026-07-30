import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

export const listMyAttemptsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();

export const attemptIdParamsSchema = z
  .object({
    attemptId: z.string().uuid('attemptId must be a valid UUID'),
  })
  .strict();

// Staff attempt detail (item: surface timeSpentSeconds to staff) — batchId
// is part of the route (not just attemptId) because it's what
// reports.service.ts's getAttemptDetailForStaff hands to
// analyticsService.assertCanAccessBatch for the same batch-assignment
// check BatchPerformancePage's own endpoints already enforce; the caller
// always already knows batchId from the BatchPerformancePage table they
// clicked into, so requiring it here is not an extra lookup for them.
export const staffAttemptParamsSchema = z
  .object({
    batchId: z.string().uuid('batchId must be a valid UUID'),
    attemptId: z.string().uuid('attemptId must be a valid UUID'),
  })
  .strict();

export type ListMyAttemptsQuery = z.infer<typeof listMyAttemptsQuerySchema>;
export type AttemptIdParams = z.infer<typeof attemptIdParamsSchema>;
export type StaffAttemptParams = z.infer<typeof staffAttemptParamsSchema>;
