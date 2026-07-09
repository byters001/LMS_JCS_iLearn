import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';
import { JUDGE0_LANGUAGE_ID } from '../../integrations/judge0/judge0.constants';

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

// --- Question categories ---
// No updated_at/deleted_at on question_categories in schema.sql — update
// still works as a plain SET (nothing to bump), delete is hard (see
// question-bank.repository.ts).

export const listQuestionCategoriesQuerySchema = z.object({
  parentCategoryId: z.string().uuid('parentCategoryId must be a valid UUID').optional(),
  ...paginationFields,
});

export const createQuestionCategorySchema = z.object({
  name: z.string().min(1, 'name is required'),
  parentCategoryId: z.string().uuid('parentCategoryId must be a valid UUID').optional(),
});

export const updateQuestionCategorySchema = z
  .object({
    name: z.string().min(1).optional(),
    parentCategoryId: z
      .string()
      .uuid('parentCategoryId must be a valid UUID')
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const questionCategoryIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// --- Question topics ---

export const listQuestionTopicsQuerySchema = z.object({
  categoryId: z.string().uuid('categoryId must be a valid UUID').optional(),
  ...paginationFields,
});

export const createQuestionTopicSchema = z.object({
  name: z.string().min(1, 'name is required'),
  categoryId: z.string().uuid('categoryId must be a valid UUID').optional(),
});

export const updateQuestionTopicSchema = z
  .object({
    name: z.string().min(1).optional(),
    categoryId: z.string().uuid('categoryId must be a valid UUID').nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const questionTopicIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// --- Question tags ---
// question_tags is the most minimal table in this schema — just id + a
// unique name, no created_at even.

export const listQuestionTagsQuerySchema = z.object({
  ...paginationFields,
});

export const createQuestionTagSchema = z.object({
  name: z.string().min(1, 'name is required'),
});

export const updateQuestionTagSchema = z.object({
  name: z.string().min(1, 'name is required'),
});

export const questionTagIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// --- Questions / question_versions (the versioned entity) ---
//
// question_options/question_images are version-scoped content
// (question_options.question_version_id, not question_id) and get no
// dedicated top-level CRUD routes in this phase — they're created as part
// of createQuestion's initial version and createQuestionVersion's new
// version, matching how training_sessions/training_program_students got
// schema-only treatment in prior phases. question_topic_map/
// question_tag_map similarly have no dedicated routes; topicIds/tagIds are
// only settable at question-creation time in this phase.

const questionOptionInputSchema = z.object({
  optionText: z.string().min(1, 'optionText is required'),
  imageUrl: z.string().url('imageUrl must be a valid URL').optional(),
  isCorrect: z.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().optional().default(0),
});

const questionImageInputSchema = z.object({
  imageUrl: z.string().url('imageUrl must be a valid URL'),
  caption: z.string().min(1).optional(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

// --- Type-specific detail payloads (Part 2) ---
//
// supportedLanguages is validated against JUDGE0_LANGUAGE_ID's keys (C,
// CPP, JAVA, JAVASCRIPT, PYTHON3) rather than accepting any string. Judge0
// types.ts's SubmissionRequest.language_id is typed as a value FROM
// JUDGE0_LANGUAGE_ID — the not-yet-built coding module will map a
// supported_languages entry through that lookup to get language_id. An
// unrecognized string here would silently fail at submission time, much
// later and harder to trace, so it's rejected at write time instead. This
// is importing a plain constants object, not calling Judge0's API or SDK,
// so it doesn't cross CLAUDE.md's integrations/judge0/ boundary rule.
const JUDGE0_LANGUAGE_KEYS = Object.keys(JUDGE0_LANGUAGE_ID) as [string, ...string[]];
const codingLanguageSchema = z.enum(JUDGE0_LANGUAGE_KEYS);

const codingQuestionDetailsInputSchema = z.object({
  problemStatement: z.string().min(1, 'problemStatement is required'),
  inputFormat: z.string().min(1).optional(),
  outputFormat: z.string().min(1).optional(),
  constraints: z.string().min(1).optional(),
  timeLimitMs: z.coerce.number().int().positive().optional(),
  memoryLimitKb: z.coerce.number().int().positive().optional(),
  supportedLanguages: z.array(codingLanguageSchema).optional(),
});

const codingTestCaseInputSchema = z.object({
  input: z.string().optional(),
  expectedOutput: z.string().optional(),
  isHidden: z.boolean().optional().default(true),
  points: z.coerce.number().positive().optional(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

// scale_type is plain TEXT with a default in schema.sql — only a code
// comment documents 'likert'/'scenario' as the intended values, no CREATE
// TYPE enum backs it at the DB level. Enforced here anyway as defensive
// input validation; the DB itself would accept any string.
const psychometricDetailsInputSchema = z.object({
  traitCategory: z.string().min(1).optional(),
  scaleType: z.enum(['likert', 'scenario']).optional(),
});

const psychometricOptionInputSchema = z.object({
  optionText: z.string().min(1, 'optionText is required'),
  traitWeight: z.coerce.number().optional(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export const listQuestionsQuerySchema = z.object({
  categoryId: z.string().uuid('categoryId must be a valid UUID').optional(),
  type: z.enum(['mcq', 'coding', 'psychometric']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  status: z.enum(['draft', 'pending_review', 'approved', 'rejected', 'archived']).optional(),
  ...paginationFields,
});

// categoryId/collegeId omitted (not required) => global/uncategorized;
// college_id NULL means the global bank per schema.sql's design.
// questionText/marks/options/images here describe version #1's content,
// created atomically with the question itself since question_text is
// NOT NULL on question_versions.
// codingDetails/testCases/psychometricDetails/psychometricOptions are
// optional here — same as options/images above — not required just because
// type is 'coding'/'psychometric'. See question-bank.service.ts for the
// type-match validation (a coding-typed question can't be created with a
// psychometricDetails payload, etc.) enforced at the service layer, since
// nothing here can see the sibling `type` field mid-parse for a
// cross-field check this codebase's Zod schemas don't otherwise use.
export const createQuestionSchema = z.object({
  categoryId: z.string().uuid('categoryId must be a valid UUID').optional(),
  type: z.enum(['mcq', 'coding', 'psychometric']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  questionText: z.string().min(1, 'questionText is required'),
  marks: z.coerce.number().positive().optional(),
  options: z.array(questionOptionInputSchema).optional(),
  images: z.array(questionImageInputSchema).optional(),
  codingDetails: codingQuestionDetailsInputSchema.optional(),
  testCases: z.array(codingTestCaseInputSchema).optional(),
  psychometricDetails: psychometricDetailsInputSchema.optional(),
  psychometricOptions: z.array(psychometricOptionInputSchema).optional(),
  topicIds: z.array(z.string().uuid('topicIds entries must be valid UUIDs')).optional(),
  tagIds: z.array(z.string().uuid('tagIds entries must be valid UUIDs')).optional(),
});

// Deliberately excludes questionText/marks/options/images (that's
// createQuestionVersion's job — content is never edited in place, see
// question-bank.service.ts) and status (approval-workflow concern, tied to
// question_approval_history which is out of scope for this phase).
export const updateQuestionSchema = z
  .object({
    categoryId: z.string().uuid('categoryId must be a valid UUID').nullable().optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    collegeId: z.string().uuid('collegeId must be a valid UUID').nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const questionIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// --- Question versions ---

export const createQuestionVersionSchema = z.object({
  questionText: z.string().min(1, 'questionText is required'),
  marks: z.coerce.number().positive().optional(),
  options: z.array(questionOptionInputSchema).optional(),
  images: z.array(questionImageInputSchema).optional(),
  codingDetails: codingQuestionDetailsInputSchema.optional(),
  testCases: z.array(codingTestCaseInputSchema).optional(),
  psychometricDetails: psychometricDetailsInputSchema.optional(),
  psychometricOptions: z.array(psychometricOptionInputSchema).optional(),
});

export const questionVersionIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  versionId: z.string().uuid('versionId must be a valid UUID'),
});

// --- Coding question details (dedicated post-creation CRUD) ---

export const createCodingQuestionDetailsSchema = codingQuestionDetailsInputSchema;

export const updateCodingQuestionDetailsSchema = z
  .object({
    problemStatement: z.string().min(1).optional(),
    inputFormat: z.string().min(1).nullable().optional(),
    outputFormat: z.string().min(1).nullable().optional(),
    constraints: z.string().min(1).nullable().optional(),
    timeLimitMs: z.coerce.number().int().positive().optional(),
    memoryLimitKb: z.coerce.number().int().positive().optional(),
    supportedLanguages: z.array(codingLanguageSchema).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

// --- Coding test cases (dedicated post-creation CRUD) ---

export const createCodingTestCaseSchema = codingTestCaseInputSchema;

export const updateCodingTestCaseSchema = z
  .object({
    input: z.string().nullable().optional(),
    expectedOutput: z.string().nullable().optional(),
    isHidden: z.boolean().optional(),
    points: z.coerce.number().positive().optional(),
    sortOrder: z.coerce.number().int().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const codingTestCaseIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  versionId: z.string().uuid('versionId must be a valid UUID'),
  testCaseId: z.string().uuid('testCaseId must be a valid UUID'),
});

// --- Psychometric details (dedicated post-creation CRUD) ---

export const createPsychometricDetailsSchema = psychometricDetailsInputSchema;

export const updatePsychometricDetailsSchema = z
  .object({
    traitCategory: z.string().min(1).nullable().optional(),
    scaleType: z.enum(['likert', 'scenario']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

// --- Psychometric options (dedicated post-creation CRUD) ---

export const createPsychometricOptionSchema = psychometricOptionInputSchema;

export const updatePsychometricOptionSchema = z
  .object({
    optionText: z.string().min(1).optional(),
    traitWeight: z.coerce.number().optional(),
    sortOrder: z.coerce.number().int().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const psychometricOptionIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  versionId: z.string().uuid('versionId must be a valid UUID'),
  optionId: z.string().uuid('optionId must be a valid UUID'),
});

export type ListQuestionCategoriesQuery = z.infer<typeof listQuestionCategoriesQuerySchema>;
export type CreateQuestionCategoryInput = z.infer<typeof createQuestionCategorySchema>;
export type UpdateQuestionCategoryInput = z.infer<typeof updateQuestionCategorySchema>;
export type QuestionCategoryIdParams = z.infer<typeof questionCategoryIdParamsSchema>;

export type ListQuestionTopicsQuery = z.infer<typeof listQuestionTopicsQuerySchema>;
export type CreateQuestionTopicInput = z.infer<typeof createQuestionTopicSchema>;
export type UpdateQuestionTopicInput = z.infer<typeof updateQuestionTopicSchema>;
export type QuestionTopicIdParams = z.infer<typeof questionTopicIdParamsSchema>;

export type ListQuestionTagsQuery = z.infer<typeof listQuestionTagsQuerySchema>;
export type CreateQuestionTagInput = z.infer<typeof createQuestionTagSchema>;
export type UpdateQuestionTagInput = z.infer<typeof updateQuestionTagSchema>;
export type QuestionTagIdParams = z.infer<typeof questionTagIdParamsSchema>;

export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type QuestionIdParams = z.infer<typeof questionIdParamsSchema>;

export type CreateQuestionVersionInput = z.infer<typeof createQuestionVersionSchema>;
export type QuestionVersionIdParams = z.infer<typeof questionVersionIdParamsSchema>;

export type CreateCodingQuestionDetailsInput = z.infer<typeof createCodingQuestionDetailsSchema>;
export type UpdateCodingQuestionDetailsInput = z.infer<typeof updateCodingQuestionDetailsSchema>;

export type CreateCodingTestCaseInput = z.infer<typeof createCodingTestCaseSchema>;
export type UpdateCodingTestCaseInput = z.infer<typeof updateCodingTestCaseSchema>;
export type CodingTestCaseIdParams = z.infer<typeof codingTestCaseIdParamsSchema>;

export type CreatePsychometricDetailsInput = z.infer<typeof createPsychometricDetailsSchema>;
export type UpdatePsychometricDetailsInput = z.infer<typeof updatePsychometricDetailsSchema>;

export type CreatePsychometricOptionInput = z.infer<typeof createPsychometricOptionSchema>;
export type UpdatePsychometricOptionInput = z.infer<typeof updatePsychometricOptionSchema>;
export type PsychometricOptionIdParams = z.infer<typeof psychometricOptionIdParamsSchema>;

// --- Approval workflow (Part 3) ---
// All three actions (submit/approve/reject) take the same optional-notes
// shape — notes is a free-text justification recorded on the
// question_approval_history row, never required since a self-explanatory
// approval shouldn't be blocked on writing a comment.

export const approvalActionSchema = z.object({
  notes: z.string().min(1).optional(),
});

export const listQuestionApprovalHistoryQuerySchema = z.object({
  ...paginationFields,
});

export type ApprovalActionInput = z.infer<typeof approvalActionSchema>;
export type ListQuestionApprovalHistoryQuery = z.infer<
  typeof listQuestionApprovalHistoryQuerySchema
>;

// --- Question pools (Part 3) ---

export const listQuestionPoolsQuerySchema = z.object({
  collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  categoryId: z.string().uuid('categoryId must be a valid UUID').optional(),
  type: z.enum(['mcq', 'coding', 'psychometric']).optional(),
  ...paginationFields,
});

export const createQuestionPoolSchema = z.object({
  name: z.string().min(1, 'name is required'),
  description: z.string().min(1).optional(),
  // Omitted => global reusable pool, matching questions.collegeId's own
  // "NULL = global bank" convention (see db/schema/question-bank.schema.ts).
  collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  categoryId: z.string().uuid('categoryId must be a valid UUID').optional(),
  type: z.enum(['mcq', 'coding', 'psychometric']),
});

export const updateQuestionPoolSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).nullable().optional(),
    collegeId: z.string().uuid('collegeId must be a valid UUID').nullable().optional(),
    categoryId: z.string().uuid('categoryId must be a valid UUID').nullable().optional(),
    // type deliberately excluded — changing a pool's question type after
    // criteria rows already exist against it would silently invalidate
    // those rows' intent; not part of the update surface, same call as
    // updateQuestionSchema excluding `type` for the same reason.
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const questionPoolIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// --- Question pool criteria (Part 3) ---
// tagFilter is modeled as an array of question_tags.id UUIDs — ANY-match
// semantics (a question qualifies if it has at least one listed tag), see
// question-bank.service.ts's resolvePoolCriterion.

export const createQuestionPoolCriteriaSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topicId: z.string().uuid('topicId must be a valid UUID').optional(),
  tagFilter: z.array(z.string().uuid('tagFilter entries must be valid UUIDs')).optional(),
  countRequired: z.coerce.number().int().positive().optional().default(1),
});

export const updateQuestionPoolCriteriaSchema = z
  .object({
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    topicId: z.string().uuid('topicId must be a valid UUID').nullable().optional(),
    tagFilter: z
      .array(z.string().uuid('tagFilter entries must be valid UUIDs'))
      .nullable()
      .optional(),
    countRequired: z.coerce.number().int().positive().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const questionPoolCriteriaIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  criteriaId: z.string().uuid('criteriaId must be a valid UUID'),
});

export type ListQuestionPoolsQuery = z.infer<typeof listQuestionPoolsQuerySchema>;
export type CreateQuestionPoolInput = z.infer<typeof createQuestionPoolSchema>;
export type UpdateQuestionPoolInput = z.infer<typeof updateQuestionPoolSchema>;
export type QuestionPoolIdParams = z.infer<typeof questionPoolIdParamsSchema>;

export type CreateQuestionPoolCriteriaInput = z.infer<typeof createQuestionPoolCriteriaSchema>;
export type UpdateQuestionPoolCriteriaInput = z.infer<typeof updateQuestionPoolCriteriaSchema>;
export type QuestionPoolCriteriaIdParams = z.infer<typeof questionPoolCriteriaIdParamsSchema>;
