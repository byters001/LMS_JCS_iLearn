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

export type ListMyAttemptsQuery = z.infer<typeof listMyAttemptsQuerySchema>;
export type AttemptIdParams = z.infer<typeof attemptIdParamsSchema>;
