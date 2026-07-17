import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

// --- Assessments ---

export const listAssessmentsQuerySchema = z
  .object({
    trainingSessionId: z.string().uuid('trainingSessionId must be a valid UUID').optional(),
    status: z
      .enum(['draft', 'review', 'approved', 'scheduled', 'live', 'completed', 'archived'])
      .optional(),
    testCategory: z.enum(['mcq', 'coding', 'psychometric', 'mixed']).optional(),
    search: z.string().min(1).optional(),
    ...paginationFields,
  })
  .strict();

// Student-facing counterpart to listAssessmentsQuerySchema — deliberately a
// separate, narrower schema rather than reusing the staff one: no
// trainingSessionId (a student doesn't pick a training session, their batch
// membership determines what they see), and status is restricted to
// 'scheduled' | 'live' only — draft/review/approved are internal pre-publish
// states, completed/archived are no longer "available." See
// GET /assessments/available in assessments.routes.ts.
export const listAvailableAssessmentsQuerySchema = z
  .object({
    status: z.enum(['scheduled', 'live']).optional(),
    ...paginationFields,
  })
  .strict();

// batchIds here drives assessment_batches rows created atomically alongside
// the assessment — see assessments.service.ts's module comment for why
// this isn't a separate top-level CRUD resource.
export const createAssessmentSchema = z
  .object({
    // Optional (item 4, decision doc): assessment_batches, not training
    // session, is what actually controls student visibility (item 8A's
    // diagnosis) — training session is a looser organizational label, not
    // worth blocking creation over when no session exists yet for a
    // college/program.
    trainingSessionId: z.string().uuid('trainingSessionId must be a valid UUID').optional(),
    title: z.string().min(1, 'title is required'),
    description: z.string().min(1).optional(),
    testCategory: z.enum(['mcq', 'coding', 'psychometric', 'mixed']),
    timerMinutes: z.coerce.number().int().positive().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    maxAttempts: z.coerce.number().int().positive().optional().default(1),
    shuffleQuestions: z.boolean().optional().default(false),
    randomQuestionCount: z.coerce.number().int().positive().optional(),
    negativeMarking: z.boolean().optional().default(false),
    negativeMarkingValue: z.coerce.number().min(0).optional(),
    proctoringCameraRequired: z.boolean().optional().default(false),
    proctoringFullscreenRequired: z.boolean().optional().default(false),
    isPractice: z.boolean().optional().default(false),
    batchIds: z.array(z.string().uuid('batchIds entries must be valid UUIDs')).optional(),
  })
  .strict();

// testCategory deliberately excluded — same call as question-bank's
// updateQuestionPoolSchema excluding `type`: sections/questions/pools
// already attached under this assessment implicitly assume a fixed test
// category (see assertQuestionMatchesTestCategory below), so changing it
// after the fact would silently invalidate that content.
// trainingSessionId is excluded too, but for a narrower reason now that
// it's optional at creation (item 4): it's purely an organizational label
// with no content-invalidation risk (unlike testCategory), so there's no
// architectural reason it couldn't be settable later — this phase simply
// doesn't add that update path, since nothing asked for "assign a session
// after the fact" yet. Revisit if that need actually comes up.
// `status` is excluded too — approval-workflow concern, handled by the
// dedicated action endpoints, not a plain field PATCH (see
// assessments.service.ts).
export const updateAssessmentSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).nullable().optional(),
    timerMinutes: z.coerce.number().int().positive().nullable().optional(),
    startAt: z.coerce.date().nullable().optional(),
    endAt: z.coerce.date().nullable().optional(),
    maxAttempts: z.coerce.number().int().positive().optional(),
    shuffleQuestions: z.boolean().optional(),
    randomQuestionCount: z.coerce.number().int().positive().nullable().optional(),
    negativeMarking: z.boolean().optional(),
    negativeMarkingValue: z.coerce.number().min(0).nullable().optional(),
    proctoringCameraRequired: z.boolean().optional(),
    proctoringFullscreenRequired: z.boolean().optional(),
    isPractice: z.boolean().optional(),
    batchIds: z.array(z.string().uuid('batchIds entries must be valid UUIDs')).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const assessmentIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();

// --- Assessment sections ---

export const createAssessmentSectionSchema = z
  .object({
    title: z.string().min(1, 'title is required'),
    instructions: z.string().min(1).optional(),
    sectionOrder: z.coerce.number().int().optional().default(0),
    timerMinutes: z.coerce.number().int().positive().optional(),
    passingMarks: z.coerce.number().min(0).optional(),
    negativeMarking: z.boolean().optional().default(false),
    negativeMarkingValue: z.coerce.number().min(0).optional(),
    shuffleQuestions: z.boolean().optional().default(false),
    selectionMode: z.enum(['manual', 'pool']).optional().default('manual'),
  })
  .strict();

// selectionMode deliberately excluded from update — switching a section
// between manual/pool after questions or pools are already attached to it
// would leave orphaned assessment_questions/assessment_section_pools rows
// with no service-layer guard preventing it. Delete and recreate the
// section instead if the mode needs to change (see
// assessments.service.ts).
export const updateAssessmentSectionSchema = z
  .object({
    title: z.string().min(1).optional(),
    instructions: z.string().min(1).nullable().optional(),
    sectionOrder: z.coerce.number().int().optional(),
    timerMinutes: z.coerce.number().int().positive().nullable().optional(),
    passingMarks: z.coerce.number().min(0).nullable().optional(),
    negativeMarking: z.boolean().optional(),
    negativeMarkingValue: z.coerce.number().min(0).nullable().optional(),
    shuffleQuestions: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const assessmentSectionIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
    sectionId: z.string().uuid('sectionId must be a valid UUID'),
  })
  .strict();

// --- Assessment questions (manual selection_mode) ---

export const createAssessmentQuestionSchema = z
  .object({
    questionVersionId: z.string().uuid('questionVersionId must be a valid UUID'),
    marksOverride: z.coerce.number().positive().optional(),
    sortOrder: z.coerce.number().int().optional().default(0),
  })
  .strict();

export const updateAssessmentQuestionSchema = z
  .object({
    marksOverride: z.coerce.number().positive().nullable().optional(),
    sortOrder: z.coerce.number().int().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const assessmentQuestionIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
    sectionId: z.string().uuid('sectionId must be a valid UUID'),
    questionId: z.string().uuid('questionId must be a valid UUID'),
  })
  .strict();

// --- Assessment section pools (pool selection_mode) ---
// No update schema — a pure junction row (question_pool_id + parent), same
// treatment as question-bank's question_topic_map/question_tag_map:
// create/delete only.

export const createAssessmentSectionPoolSchema = z
  .object({
    questionPoolId: z.string().uuid('questionPoolId must be a valid UUID'),
  })
  .strict();

export const assessmentSectionPoolIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
    sectionId: z.string().uuid('sectionId must be a valid UUID'),
    poolId: z.string().uuid('poolId must be a valid UUID'),
  })
  .strict();

// --- Approval workflow ---
// Same optional-notes shape as question-bank's approvalActionSchema — each
// module defines its own copy rather than sharing one, matching how every
// other Zod schema in this codebase is module-local, not cross-imported.

export const assessmentApprovalActionSchema = z
  .object({
    notes: z.string().min(1).optional(),
  })
  .strict();

// Dedicated shape for schedule specifically, NOT an extension of
// assessmentApprovalActionSchema — submit/approve/reject/publish have no
// business ever accepting startAt/endAt (schedule is the only action whose
// job description IS committing to a window), so giving it its own schema
// keeps that asymmetry explicit rather than bolting optional fields onto a
// shape three other actions also use. startAt/endAt are REQUIRED here
// (not optional): this is the only reachable place in the whole workflow
// that can ever set them — PATCH /assessments/:id is blocked outside
// status='draft' (assertAssessmentEditable), and by the time schedule is
// callable (status='approved', reached via submit -> approve) the
// assessment can never be 'draft' again. See assessments.service.ts's
// scheduleAssessment for the full fix.
export const scheduleAssessmentSchema = z
  .object({
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    notes: z.string().min(1).optional(),
  })
  .strict();

export const listAssessmentApprovalHistoryQuerySchema = z
  .object({
    ...paginationFields,
  })
  .strict();

export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>;
export type ListAvailableAssessmentsQuery = z.infer<typeof listAvailableAssessmentsQuerySchema>;
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;
export type AssessmentIdParams = z.infer<typeof assessmentIdParamsSchema>;

export type CreateAssessmentSectionInput = z.infer<typeof createAssessmentSectionSchema>;
export type UpdateAssessmentSectionInput = z.infer<typeof updateAssessmentSectionSchema>;
export type AssessmentSectionIdParams = z.infer<typeof assessmentSectionIdParamsSchema>;

export type CreateAssessmentQuestionInput = z.infer<typeof createAssessmentQuestionSchema>;
export type UpdateAssessmentQuestionInput = z.infer<typeof updateAssessmentQuestionSchema>;
export type AssessmentQuestionIdParams = z.infer<typeof assessmentQuestionIdParamsSchema>;

export type CreateAssessmentSectionPoolInput = z.infer<typeof createAssessmentSectionPoolSchema>;
export type AssessmentSectionPoolIdParams = z.infer<typeof assessmentSectionPoolIdParamsSchema>;

export type AssessmentApprovalActionInput = z.infer<typeof assessmentApprovalActionSchema>;
export type ScheduleAssessmentInput = z.infer<typeof scheduleAssessmentSchema>;
export type ListAssessmentApprovalHistoryQuery = z.infer<
  typeof listAssessmentApprovalHistoryQuerySchema
>;
