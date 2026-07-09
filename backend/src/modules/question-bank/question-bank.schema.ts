import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

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
export const createQuestionSchema = z.object({
  categoryId: z.string().uuid('categoryId must be a valid UUID').optional(),
  type: z.enum(['mcq', 'coding', 'psychometric']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  questionText: z.string().min(1, 'questionText is required'),
  marks: z.coerce.number().positive().optional(),
  options: z.array(questionOptionInputSchema).optional(),
  images: z.array(questionImageInputSchema).optional(),
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
});

export const questionVersionIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  versionId: z.string().uuid('versionId must be a valid UUID'),
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
