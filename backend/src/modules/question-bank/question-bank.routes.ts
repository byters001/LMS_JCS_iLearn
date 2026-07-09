import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requireAnyPermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { questionBankController } from './question-bank.controller';
import {
  codingTestCaseIdParamsSchema,
  createCodingQuestionDetailsSchema,
  createCodingTestCaseSchema,
  createPsychometricDetailsSchema,
  createPsychometricOptionSchema,
  createQuestionCategorySchema,
  createQuestionSchema,
  createQuestionTagSchema,
  createQuestionTopicSchema,
  createQuestionVersionSchema,
  listQuestionCategoriesQuerySchema,
  listQuestionTagsQuerySchema,
  listQuestionTopicsQuerySchema,
  listQuestionsQuerySchema,
  psychometricOptionIdParamsSchema,
  questionCategoryIdParamsSchema,
  questionIdParamsSchema,
  questionTagIdParamsSchema,
  questionTopicIdParamsSchema,
  questionVersionIdParamsSchema,
  updateCodingQuestionDetailsSchema,
  updateCodingTestCaseSchema,
  updatePsychometricDetailsSchema,
  updatePsychometricOptionSchema,
  updateQuestionCategorySchema,
  updateQuestionSchema,
  updateQuestionTagSchema,
  updateQuestionTopicSchema,
  type CodingTestCaseIdParams,
  type CreateCodingQuestionDetailsInput,
  type CreateCodingTestCaseInput,
  type CreatePsychometricDetailsInput,
  type CreatePsychometricOptionInput,
  type CreateQuestionCategoryInput,
  type CreateQuestionInput,
  type CreateQuestionTagInput,
  type CreateQuestionTopicInput,
  type CreateQuestionVersionInput,
  type ListQuestionCategoriesQuery,
  type ListQuestionTagsQuery,
  type ListQuestionTopicsQuery,
  type ListQuestionsQuery,
  type PsychometricOptionIdParams,
  type QuestionCategoryIdParams,
  type QuestionIdParams,
  type QuestionTagIdParams,
  type QuestionTopicIdParams,
  type QuestionVersionIdParams,
  type UpdateCodingQuestionDetailsInput,
  type UpdateCodingTestCaseInput,
  type UpdatePsychometricDetailsInput,
  type UpdatePsychometricOptionInput,
  type UpdateQuestionCategoryInput,
  type UpdateQuestionInput,
  type UpdateQuestionTagInput,
  type UpdateQuestionTopicInput,
} from './question-bank.schema';

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

function validateBody(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    request.body = parsed.data;
  };
}

// Permission mapping: schema.sql seeds exactly three question-bank keys —
// questions.manage ("own/college"), questions.manage_global, and
// questions.approve. Notably there is NO questions.view key at all (checked
// by grep, not assumed) — unlike every other module built so far (users,
// colleges, trainers, students all have a dedicated .view key). Since
// manage is the only key that grants any question-bank access whatsoever,
// every route below — including plain GET/list — is gated the same way
// read and write alike, rather than inventing a view key schema.sql doesn't
// have.
//
// questions.manage vs questions.manage_global: two independent manage-tier
// keys for one resource, a first in this codebase. requirePermission()
// only checks a single key, so requireAnyPermission() (added in
// rbac/require-permission.ts) is used instead — a route passes if the
// caller holds EITHER key. The permission cache already resolves keys
// scoped to the caller's activeCollegeId (rbac/permission-cache.ts), so a
// user holding only questions.manage at one college naturally can't act
// while a different college is active — "own/college" scoping falls out of
// existing infra for free, no extra per-request collegeId cross-checking
// was added here.
//
// questions.approve is NOT used anywhere in this file: no status-transition
// or approval action exists in this phase (see question-bank.schema.ts —
// status is excluded from updateQuestionSchema, and
// activateQuestionVersion is a mechanical "make this version current" op,
// not an approval decision). It's reserved for the not-yet-built
// question_approval_history workflow (Part 2/3).
const QUESTION_BANK_MANAGE = requireAnyPermission(['questions.manage', 'questions.manage_global']);

export async function questionBankRoutes(fastify: FastifyInstance): Promise<void> {
  // --- Question categories ---

  fastify.get<{ Querystring: ListQuestionCategoriesQuery }>(
    '/question-categories',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateQuery(listQuestionCategoriesQuerySchema),
    },
    questionBankController.listQuestionCategories,
  );

  fastify.get<{ Params: QuestionCategoryIdParams }>(
    '/question-categories/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionCategoryIdParamsSchema),
    },
    questionBankController.getQuestionCategoryById,
  );

  fastify.post<{ Body: CreateQuestionCategoryInput }>(
    '/question-categories',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateBody(createQuestionCategorySchema),
    },
    questionBankController.createQuestionCategory,
  );

  fastify.patch<{ Params: QuestionCategoryIdParams; Body: UpdateQuestionCategoryInput }>(
    '/question-categories/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(questionCategoryIdParamsSchema),
        validateBody(updateQuestionCategorySchema),
      ],
    },
    questionBankController.updateQuestionCategory,
  );

  fastify.delete<{ Params: QuestionCategoryIdParams }>(
    '/question-categories/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionCategoryIdParamsSchema),
    },
    questionBankController.deleteQuestionCategory,
  );

  // --- Question topics ---

  fastify.get<{ Querystring: ListQuestionTopicsQuery }>(
    '/question-topics',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateQuery(listQuestionTopicsQuerySchema),
    },
    questionBankController.listQuestionTopics,
  );

  fastify.get<{ Params: QuestionTopicIdParams }>(
    '/question-topics/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionTopicIdParamsSchema),
    },
    questionBankController.getQuestionTopicById,
  );

  fastify.post<{ Body: CreateQuestionTopicInput }>(
    '/question-topics',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateBody(createQuestionTopicSchema),
    },
    questionBankController.createQuestionTopic,
  );

  fastify.patch<{ Params: QuestionTopicIdParams; Body: UpdateQuestionTopicInput }>(
    '/question-topics/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(questionTopicIdParamsSchema),
        validateBody(updateQuestionTopicSchema),
      ],
    },
    questionBankController.updateQuestionTopic,
  );

  fastify.delete<{ Params: QuestionTopicIdParams }>(
    '/question-topics/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionTopicIdParamsSchema),
    },
    questionBankController.deleteQuestionTopic,
  );

  // --- Question tags ---

  fastify.get<{ Querystring: ListQuestionTagsQuery }>(
    '/question-tags',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateQuery(listQuestionTagsQuerySchema),
    },
    questionBankController.listQuestionTags,
  );

  fastify.get<{ Params: QuestionTagIdParams }>(
    '/question-tags/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionTagIdParamsSchema),
    },
    questionBankController.getQuestionTagById,
  );

  fastify.post<{ Body: CreateQuestionTagInput }>(
    '/question-tags',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateBody(createQuestionTagSchema),
    },
    questionBankController.createQuestionTag,
  );

  fastify.patch<{ Params: QuestionTagIdParams; Body: UpdateQuestionTagInput }>(
    '/question-tags/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(questionTagIdParamsSchema),
        validateBody(updateQuestionTagSchema),
      ],
    },
    questionBankController.updateQuestionTag,
  );

  fastify.delete<{ Params: QuestionTagIdParams }>(
    '/question-tags/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionTagIdParamsSchema),
    },
    questionBankController.deleteQuestionTag,
  );

  // --- Questions ---

  fastify.get<{ Querystring: ListQuestionsQuery }>(
    '/questions',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateQuery(listQuestionsQuerySchema),
    },
    questionBankController.listQuestions,
  );

  // Returns the question row plus its current version's full content
  // (question_text/marks/options/images) — see question-bank.controller.ts.
  fastify.get<{ Params: QuestionIdParams }>(
    '/questions/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionIdParamsSchema),
    },
    questionBankController.getQuestionById,
  );

  // Creates the questions row AND its first question_versions row
  // atomically — see question-bank.service.ts.
  fastify.post<{ Body: CreateQuestionInput }>(
    '/questions',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateBody(createQuestionSchema),
    },
    questionBankController.createQuestion,
  );

  // Metadata only (category/difficulty/college) — never touches version
  // content. See createQuestionVersion below for content edits.
  fastify.patch<{ Params: QuestionIdParams; Body: UpdateQuestionInput }>(
    '/questions/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [validateParams(questionIdParamsSchema), validateBody(updateQuestionSchema)],
    },
    questionBankController.updateQuestion,
  );

  // Soft delete (questions.deleted_at).
  fastify.delete<{ Params: QuestionIdParams }>(
    '/questions/:id',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionIdParamsSchema),
    },
    questionBankController.deleteQuestion,
  );

  // --- Question versions ---
  // No PATCH/DELETE for individual versions — question_versions rows are
  // append-only/immutable once created (no updated_at/deleted_at columns in
  // schema.sql). Corrections always create a new version; see
  // question-bank.service.ts.

  fastify.get<{ Params: QuestionIdParams }>(
    '/questions/:id/versions',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionIdParamsSchema),
    },
    questionBankController.listQuestionVersions,
  );

  fastify.get<{ Params: QuestionVersionIdParams }>(
    '/questions/:id/versions/:versionId',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionVersionIdParamsSchema),
    },
    questionBankController.getQuestionVersionById,
  );

  // Always creates a NEW version row (never active by default) — a
  // subsequent call to the activate route below is required to make it the
  // question's current version.
  fastify.post<{ Params: QuestionIdParams; Body: CreateQuestionVersionInput }>(
    '/questions/:id/versions',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(questionIdParamsSchema),
        validateBody(createQuestionVersionSchema),
      ],
    },
    questionBankController.createQuestionVersion,
  );

  // Gated the same as every other question-bank mutation route
  // (questions.manage / questions.manage_global), not questions.approve —
  // this is a mechanical "make this version current" operation, not an
  // approval decision. See the module comment above.
  fastify.post<{ Params: QuestionVersionIdParams }>(
    '/questions/:id/versions/:versionId/activate',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionVersionIdParamsSchema),
    },
    questionBankController.activateQuestionVersion,
  );

  // --- Coding question details (1:1 per version) ---
  // Nested under /questions/:id/versions/:versionId — these tables key off
  // question_version_id, not question_id (coding_question_details.
  // question_version_id/psychometric_details.question_version_id are both
  // UNIQUE, so this route shape naturally maps to "the one coding-details
  // resource for this version" rather than needing its own :detailId).
  // Mutations 409 once the version is active (see
  // question-bank.service.ts's assertVersionMutable) — not enforced here,
  // enforced in the service, same layering as every other business rule in
  // this codebase.

  fastify.get<{ Params: QuestionVersionIdParams }>(
    '/questions/:id/versions/:versionId/coding-details',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionVersionIdParamsSchema),
    },
    questionBankController.getCodingQuestionDetails,
  );

  fastify.post<{ Params: QuestionVersionIdParams; Body: CreateCodingQuestionDetailsInput }>(
    '/questions/:id/versions/:versionId/coding-details',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(questionVersionIdParamsSchema),
        validateBody(createCodingQuestionDetailsSchema),
      ],
    },
    questionBankController.createCodingQuestionDetails,
  );

  fastify.patch<{ Params: QuestionVersionIdParams; Body: UpdateCodingQuestionDetailsInput }>(
    '/questions/:id/versions/:versionId/coding-details',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(questionVersionIdParamsSchema),
        validateBody(updateCodingQuestionDetailsSchema),
      ],
    },
    questionBankController.updateCodingQuestionDetails,
  );

  fastify.delete<{ Params: QuestionVersionIdParams }>(
    '/questions/:id/versions/:versionId/coding-details',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionVersionIdParamsSchema),
    },
    questionBankController.deleteCodingQuestionDetails,
  );

  // --- Coding test cases (1:many per version) ---
  // No dedicated GET :testCaseId route — same economy as
  // organization.routes.ts's training-program-trainers (list + mutate, no
  // single-item read).

  fastify.get<{ Params: QuestionVersionIdParams }>(
    '/questions/:id/versions/:versionId/coding-test-cases',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionVersionIdParamsSchema),
    },
    questionBankController.listCodingTestCases,
  );

  fastify.post<{ Params: QuestionVersionIdParams; Body: CreateCodingTestCaseInput }>(
    '/questions/:id/versions/:versionId/coding-test-cases',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(questionVersionIdParamsSchema),
        validateBody(createCodingTestCaseSchema),
      ],
    },
    questionBankController.createCodingTestCase,
  );

  fastify.patch<{ Params: CodingTestCaseIdParams; Body: UpdateCodingTestCaseInput }>(
    '/questions/:id/versions/:versionId/coding-test-cases/:testCaseId',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(codingTestCaseIdParamsSchema),
        validateBody(updateCodingTestCaseSchema),
      ],
    },
    questionBankController.updateCodingTestCase,
  );

  fastify.delete<{ Params: CodingTestCaseIdParams }>(
    '/questions/:id/versions/:versionId/coding-test-cases/:testCaseId',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(codingTestCaseIdParamsSchema),
    },
    questionBankController.deleteCodingTestCase,
  );

  // --- Psychometric details (1:1 per version) ---

  fastify.get<{ Params: QuestionVersionIdParams }>(
    '/questions/:id/versions/:versionId/psychometric-details',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionVersionIdParamsSchema),
    },
    questionBankController.getPsychometricDetails,
  );

  fastify.post<{ Params: QuestionVersionIdParams; Body: CreatePsychometricDetailsInput }>(
    '/questions/:id/versions/:versionId/psychometric-details',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(questionVersionIdParamsSchema),
        validateBody(createPsychometricDetailsSchema),
      ],
    },
    questionBankController.createPsychometricDetails,
  );

  fastify.patch<{ Params: QuestionVersionIdParams; Body: UpdatePsychometricDetailsInput }>(
    '/questions/:id/versions/:versionId/psychometric-details',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(questionVersionIdParamsSchema),
        validateBody(updatePsychometricDetailsSchema),
      ],
    },
    questionBankController.updatePsychometricDetails,
  );

  fastify.delete<{ Params: QuestionVersionIdParams }>(
    '/questions/:id/versions/:versionId/psychometric-details',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionVersionIdParamsSchema),
    },
    questionBankController.deletePsychometricDetails,
  );

  // --- Psychometric options (1:many per version) ---

  fastify.get<{ Params: QuestionVersionIdParams }>(
    '/questions/:id/versions/:versionId/psychometric-options',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(questionVersionIdParamsSchema),
    },
    questionBankController.listPsychometricOptions,
  );

  fastify.post<{ Params: QuestionVersionIdParams; Body: CreatePsychometricOptionInput }>(
    '/questions/:id/versions/:versionId/psychometric-options',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(questionVersionIdParamsSchema),
        validateBody(createPsychometricOptionSchema),
      ],
    },
    questionBankController.createPsychometricOption,
  );

  fastify.patch<{ Params: PsychometricOptionIdParams; Body: UpdatePsychometricOptionInput }>(
    '/questions/:id/versions/:versionId/psychometric-options/:optionId',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: [
        validateParams(psychometricOptionIdParamsSchema),
        validateBody(updatePsychometricOptionSchema),
      ],
    },
    questionBankController.updatePsychometricOption,
  );

  fastify.delete<{ Params: PsychometricOptionIdParams }>(
    '/questions/:id/versions/:versionId/psychometric-options/:optionId',
    {
      preHandler: [fastify.authenticate, QUESTION_BANK_MANAGE],
      preValidation: validateParams(psychometricOptionIdParamsSchema),
    },
    questionBankController.deletePsychometricOption,
  );
}

export default questionBankRoutes;
