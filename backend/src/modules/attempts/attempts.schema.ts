import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

// --- Attempts ---

export const startAttemptSchema = z
  .object({
    assessmentId: z.string().uuid('assessmentId must be a valid UUID'),
  })
  .strict();

// Self-scoped only in this phase (Part 1) — there is no staff-facing
// "list attempts across students" endpoint here (see attempts.service.ts's
// module comment on why that's deliberately out of scope). assessmentId is
// optional: omitted means "all of my attempts across every assessment."
export const listMyAttemptsQuerySchema = z
  .object({
    assessmentId: z.string().uuid('assessmentId must be a valid UUID').optional(),
  })
  .strict();

export const attemptIdParamsSchema = z
  .object({
    attemptId: z.string().uuid('attemptId must be a valid UUID'),
  })
  .strict();

// --- Attempt responses ---

export const attemptResponseParamsSchema = z
  .object({
    attemptId: z.string().uuid('attemptId must be a valid UUID'),
    questionVersionId: z.string().uuid('questionVersionId must be a valid UUID'),
  })
  .strict();

// selectedOptionId (MCQ) and likertValue (psychometric) are both optional
// and not cross-validated against each other here — same convention as
// question-bank's createQuestionSchema (type-specific payloads aren't
// cross-checked mid-parse); attempts.service.ts's submitResponse validates
// selectedOptionId against the question's actual type and its frozen
// option set. A caller may send only isMarkedForReview/timeSpentSeconds
// with no answer at all (flag-for-later without answering yet), so at
// least one field is still required (matching every other upsert/update
// schema's convention in this codebase) but it need not be the answer
// itself.
export const submitResponseSchema = z
  .object({
    selectedOptionId: z.string().uuid('selectedOptionId must be a valid UUID').optional(),
    likertValue: z.coerce.number().int().optional(),
    isMarkedForReview: z.boolean().optional(),
    timeSpentSeconds: z.coerce.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

// --- Proctoring events (Part 2) ---
// eventMeta is untyped JSONB in schema.sql (no CHECK backing its shape) —
// z.unknown() rather than z.record(...) so this doesn't narrow to a shape
// the DB itself doesn't enforce.

export const recordProctoringEventSchema = z
  .object({
    eventType: z.enum([
      'tab_switch',
      'fullscreen_exit',
      'camera_flag',
      'copy_paste',
      'network_disconnect',
      'window_blur',
    ]),
    eventMeta: z.unknown().optional(),
  })
  .strict();

// --- Retake requests (Part 2) ---

export const createRetakeRequestSchema = z
  .object({
    reason: z.string().min(1).optional(),
  })
  .strict();

// Staff worklist — self-scoped student filtering doesn't apply here (see
// attempts.service.ts's listRetakeRequests module comment).
export const listRetakeRequestsQuerySchema = z
  .object({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    attemptId: z.string().uuid('attemptId must be a valid UUID').optional(),
    ...paginationFields,
  })
  .strict();

export const retakeRequestIdParamsSchema = z
  .object({
    retakeRequestId: z.string().uuid('retakeRequestId must be a valid UUID'),
  })
  .strict();

export type StartAttemptInput = z.infer<typeof startAttemptSchema>;
export type ListMyAttemptsQuery = z.infer<typeof listMyAttemptsQuerySchema>;
export type AttemptIdParams = z.infer<typeof attemptIdParamsSchema>;
export type AttemptResponseParams = z.infer<typeof attemptResponseParamsSchema>;
export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;
export type RecordProctoringEventInput = z.infer<typeof recordProctoringEventSchema>;
export type CreateRetakeRequestInput = z.infer<typeof createRetakeRequestSchema>;
export type ListRetakeRequestsQuery = z.infer<typeof listRetakeRequestsQuerySchema>;
export type RetakeRequestIdParams = z.infer<typeof retakeRequestIdParamsSchema>;
