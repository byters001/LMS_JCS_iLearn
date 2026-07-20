import type { FastifyReply, FastifyRequest } from 'fastify';
import { STORAGE_BUCKET, STORAGE_BUCKET_CONFIG } from '../../integrations/supabase';
import { UnauthorizedError, ValidationError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { questionBankService } from './question-bank.service';
import type {
  ApprovalActionInput,
  CodingTestCaseIdParams,
  CreateCodingQuestionDetailsInput,
  CreateCodingTestCaseInput,
  CreatePsychometricDetailsInput,
  CreatePsychometricOptionInput,
  CreateQuestionCategoryInput,
  CreateQuestionInput,
  CreateQuestionPoolCriteriaInput,
  CreateQuestionPoolInput,
  CreateQuestionTagInput,
  CreateQuestionTopicInput,
  CreateQuestionVersionInput,
  ListQuestionApprovalHistoryQuery,
  ListQuestionCategoriesQuery,
  ListQuestionPoolsQuery,
  ListQuestionTagsQuery,
  ListQuestionTopicsQuery,
  ListQuestionsQuery,
  PsychometricOptionIdParams,
  QuestionCategoryIdParams,
  QuestionIdParams,
  QuestionPoolCriteriaIdParams,
  QuestionPoolIdParams,
  QuestionTagIdParams,
  QuestionTopicIdParams,
  QuestionVersionIdParams,
  UpdateCodingQuestionDetailsInput,
  UpdateCodingTestCaseInput,
  UpdatePsychometricDetailsInput,
  UpdatePsychometricOptionInput,
  UpdateQuestionCategoryInput,
  UpdateQuestionInput,
  UpdateQuestionPoolCriteriaInput,
  UpdateQuestionPoolInput,
  UpdateQuestionTagInput,
  UpdateQuestionTopicInput,
} from './question-bank.schema';

function requireUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

// --- Question categories ---

async function listQuestionCategories(
  request: FastifyRequest<{ Querystring: ListQuestionCategoriesQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await questionBankService.listQuestionCategories(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getQuestionCategoryById(
  request: FastifyRequest<{ Params: QuestionCategoryIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const category = await questionBankService.findQuestionCategoryById(request.params.id);
  const response: ApiSuccessResponse<typeof category> = { success: true, data: category };
  reply.status(200).send(response);
}

async function createQuestionCategory(
  request: FastifyRequest<{ Body: CreateQuestionCategoryInput }>,
  reply: FastifyReply,
): Promise<void> {
  const category = await questionBankService.createQuestionCategory(request.body);
  const response: ApiSuccessResponse<typeof category> = { success: true, data: category };
  reply.status(201).send(response);
}

async function updateQuestionCategory(
  request: FastifyRequest<{ Params: QuestionCategoryIdParams; Body: UpdateQuestionCategoryInput }>,
  reply: FastifyReply,
): Promise<void> {
  const category = await questionBankService.updateQuestionCategory(
    request.params.id,
    request.body,
  );
  const response: ApiSuccessResponse<typeof category> = { success: true, data: category };
  reply.status(200).send(response);
}

async function deleteQuestionCategory(
  request: FastifyRequest<{ Params: QuestionCategoryIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await questionBankService.deleteQuestionCategory(request.params.id);
  reply.status(204).send();
}

// --- Question topics ---

async function listQuestionTopics(
  request: FastifyRequest<{ Querystring: ListQuestionTopicsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await questionBankService.listQuestionTopics(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getQuestionTopicById(
  request: FastifyRequest<{ Params: QuestionTopicIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const topic = await questionBankService.findQuestionTopicById(request.params.id);
  const response: ApiSuccessResponse<typeof topic> = { success: true, data: topic };
  reply.status(200).send(response);
}

async function createQuestionTopic(
  request: FastifyRequest<{ Body: CreateQuestionTopicInput }>,
  reply: FastifyReply,
): Promise<void> {
  const topic = await questionBankService.createQuestionTopic(request.body);
  const response: ApiSuccessResponse<typeof topic> = { success: true, data: topic };
  reply.status(201).send(response);
}

async function updateQuestionTopic(
  request: FastifyRequest<{ Params: QuestionTopicIdParams; Body: UpdateQuestionTopicInput }>,
  reply: FastifyReply,
): Promise<void> {
  const topic = await questionBankService.updateQuestionTopic(request.params.id, request.body);
  const response: ApiSuccessResponse<typeof topic> = { success: true, data: topic };
  reply.status(200).send(response);
}

async function deleteQuestionTopic(
  request: FastifyRequest<{ Params: QuestionTopicIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await questionBankService.deleteQuestionTopic(request.params.id);
  reply.status(204).send();
}

// --- Question tags ---

async function listQuestionTags(
  request: FastifyRequest<{ Querystring: ListQuestionTagsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await questionBankService.listQuestionTags(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getQuestionTagById(
  request: FastifyRequest<{ Params: QuestionTagIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const tag = await questionBankService.findQuestionTagById(request.params.id);
  const response: ApiSuccessResponse<typeof tag> = { success: true, data: tag };
  reply.status(200).send(response);
}

async function createQuestionTag(
  request: FastifyRequest<{ Body: CreateQuestionTagInput }>,
  reply: FastifyReply,
): Promise<void> {
  const tag = await questionBankService.createQuestionTag(request.body);
  const response: ApiSuccessResponse<typeof tag> = { success: true, data: tag };
  reply.status(201).send(response);
}

async function updateQuestionTag(
  request: FastifyRequest<{ Params: QuestionTagIdParams; Body: UpdateQuestionTagInput }>,
  reply: FastifyReply,
): Promise<void> {
  const tag = await questionBankService.updateQuestionTag(request.params.id, request.body);
  const response: ApiSuccessResponse<typeof tag> = { success: true, data: tag };
  reply.status(200).send(response);
}

async function deleteQuestionTag(
  request: FastifyRequest<{ Params: QuestionTagIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await questionBankService.deleteQuestionTag(request.params.id);
  reply.status(204).send();
}

// --- Questions / question_versions ---

async function listQuestions(
  request: FastifyRequest<{ Querystring: ListQuestionsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const result = await questionBankService.listQuestions(userId, request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

// Returns the question row plus its current version's full content — the
// "give me everything about this question" view described in
// question-bank.service.ts.
async function getQuestionById(
  request: FastifyRequest<{ Params: QuestionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const question = await questionBankService.findQuestionWithCurrentVersion(request.params.id);
  const response: ApiSuccessResponse<typeof question> = { success: true, data: question };
  reply.status(200).send(response);
}

async function createQuestion(
  request: FastifyRequest<{ Body: CreateQuestionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const question = await questionBankService.createQuestion(request.body, createdBy);
  const response: ApiSuccessResponse<typeof question> = { success: true, data: question };
  reply.status(201).send(response);
}

// multipart/form-data, not JSON — mirrors users.controller.ts's
// uploadAvatar exactly (fail-fast MIME check here, buffer the file, hand
// off to the service). Not scoped to a :id — see question-bank.service.ts's
// uploadQuestionImage for why (no question/version exists yet at the point
// a trainer picks an image on the create form).
async function uploadQuestionImage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const uploadedBy = requireUserId(request);

  const multipartFile = await request.file();
  if (!multipartFile) {
    throw new ValidationError('No file uploaded');
  }

  const contentType = multipartFile.mimetype;
  const { allowedMimeTypes } = STORAGE_BUCKET_CONFIG[STORAGE_BUCKET.QUESTION_IMAGES];

  if (!allowedMimeTypes.includes(contentType)) {
    throw new ValidationError(`Content type "${contentType}" is not allowed for question images`, {
      allowedMimeTypes,
    });
  }

  const fileBuffer = await multipartFile.toBuffer();

  const imageUrl = await questionBankService.uploadQuestionImage(
    fileBuffer,
    contentType,
    uploadedBy,
  );

  const response: ApiSuccessResponse<{ imageUrl: string }> = { success: true, data: { imageUrl } };
  reply.status(201).send(response);
}

async function updateQuestion(
  request: FastifyRequest<{ Params: QuestionIdParams; Body: UpdateQuestionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const question = await questionBankService.updateQuestion(
    request.params.id,
    request.body,
    updatedBy,
  );
  const response: ApiSuccessResponse<typeof question> = { success: true, data: question };
  reply.status(200).send(response);
}

async function deleteQuestion(
  request: FastifyRequest<{ Params: QuestionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await questionBankService.deleteQuestion(request.params.id);
  reply.status(204).send();
}

async function listQuestionVersions(
  request: FastifyRequest<{ Params: QuestionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const versions = await questionBankService.listQuestionVersions(request.params.id);
  const response: ApiSuccessResponse<typeof versions> = { success: true, data: versions };
  reply.status(200).send(response);
}

async function getQuestionVersionById(
  request: FastifyRequest<{ Params: QuestionVersionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const version = await questionBankService.findQuestionVersionById(
    request.params.id,
    request.params.versionId,
  );
  const response: ApiSuccessResponse<typeof version> = { success: true, data: version };
  reply.status(200).send(response);
}

async function createQuestionVersion(
  request: FastifyRequest<{ Params: QuestionIdParams; Body: CreateQuestionVersionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const version = await questionBankService.createQuestionVersion(
    request.params.id,
    request.body,
    createdBy,
  );
  const response: ApiSuccessResponse<typeof version> = { success: true, data: version };
  reply.status(201).send(response);
}

async function activateQuestionVersion(
  request: FastifyRequest<{ Params: QuestionVersionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const question = await questionBankService.activateQuestionVersion(
    request.params.id,
    request.params.versionId,
  );
  const response: ApiSuccessResponse<typeof question> = { success: true, data: question };
  reply.status(200).send(response);
}

// --- Coding question details (1:1 per version) ---

async function getCodingQuestionDetails(
  request: FastifyRequest<{ Params: QuestionVersionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const details = await questionBankService.findCodingQuestionDetails(
    request.params.id,
    request.params.versionId,
  );
  const response: ApiSuccessResponse<typeof details> = { success: true, data: details };
  reply.status(200).send(response);
}

async function createCodingQuestionDetails(
  request: FastifyRequest<{ Params: QuestionVersionIdParams; Body: CreateCodingQuestionDetailsInput }>,
  reply: FastifyReply,
): Promise<void> {
  const details = await questionBankService.createCodingQuestionDetails(
    request.params.id,
    request.params.versionId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof details> = { success: true, data: details };
  reply.status(201).send(response);
}

async function updateCodingQuestionDetails(
  request: FastifyRequest<{ Params: QuestionVersionIdParams; Body: UpdateCodingQuestionDetailsInput }>,
  reply: FastifyReply,
): Promise<void> {
  const details = await questionBankService.updateCodingQuestionDetails(
    request.params.id,
    request.params.versionId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof details> = { success: true, data: details };
  reply.status(200).send(response);
}

async function deleteCodingQuestionDetails(
  request: FastifyRequest<{ Params: QuestionVersionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await questionBankService.deleteCodingQuestionDetails(request.params.id, request.params.versionId);
  reply.status(204).send();
}

// --- Coding test cases (1:many per version) ---

async function listCodingTestCases(
  request: FastifyRequest<{ Params: QuestionVersionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const testCases = await questionBankService.listCodingTestCases(
    request.params.id,
    request.params.versionId,
  );
  const response: ApiSuccessResponse<typeof testCases> = { success: true, data: testCases };
  reply.status(200).send(response);
}

async function createCodingTestCase(
  request: FastifyRequest<{ Params: QuestionVersionIdParams; Body: CreateCodingTestCaseInput }>,
  reply: FastifyReply,
): Promise<void> {
  const testCase = await questionBankService.createCodingTestCase(
    request.params.id,
    request.params.versionId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof testCase> = { success: true, data: testCase };
  reply.status(201).send(response);
}

async function updateCodingTestCase(
  request: FastifyRequest<{ Params: CodingTestCaseIdParams; Body: UpdateCodingTestCaseInput }>,
  reply: FastifyReply,
): Promise<void> {
  const testCase = await questionBankService.updateCodingTestCase(
    request.params.id,
    request.params.versionId,
    request.params.testCaseId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof testCase> = { success: true, data: testCase };
  reply.status(200).send(response);
}

async function deleteCodingTestCase(
  request: FastifyRequest<{ Params: CodingTestCaseIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await questionBankService.deleteCodingTestCase(
    request.params.id,
    request.params.versionId,
    request.params.testCaseId,
  );
  reply.status(204).send();
}

// --- Psychometric details (1:1 per version) ---

async function getPsychometricDetails(
  request: FastifyRequest<{ Params: QuestionVersionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const details = await questionBankService.findPsychometricDetails(
    request.params.id,
    request.params.versionId,
  );
  const response: ApiSuccessResponse<typeof details> = { success: true, data: details };
  reply.status(200).send(response);
}

async function createPsychometricDetails(
  request: FastifyRequest<{ Params: QuestionVersionIdParams; Body: CreatePsychometricDetailsInput }>,
  reply: FastifyReply,
): Promise<void> {
  const details = await questionBankService.createPsychometricDetails(
    request.params.id,
    request.params.versionId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof details> = { success: true, data: details };
  reply.status(201).send(response);
}

async function updatePsychometricDetails(
  request: FastifyRequest<{ Params: QuestionVersionIdParams; Body: UpdatePsychometricDetailsInput }>,
  reply: FastifyReply,
): Promise<void> {
  const details = await questionBankService.updatePsychometricDetails(
    request.params.id,
    request.params.versionId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof details> = { success: true, data: details };
  reply.status(200).send(response);
}

async function deletePsychometricDetails(
  request: FastifyRequest<{ Params: QuestionVersionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await questionBankService.deletePsychometricDetails(request.params.id, request.params.versionId);
  reply.status(204).send();
}

// --- Psychometric options (1:many per version) ---

async function listPsychometricOptions(
  request: FastifyRequest<{ Params: QuestionVersionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const options = await questionBankService.listPsychometricOptions(
    request.params.id,
    request.params.versionId,
  );
  const response: ApiSuccessResponse<typeof options> = { success: true, data: options };
  reply.status(200).send(response);
}

async function createPsychometricOption(
  request: FastifyRequest<{ Params: QuestionVersionIdParams; Body: CreatePsychometricOptionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const option = await questionBankService.createPsychometricOption(
    request.params.id,
    request.params.versionId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof option> = { success: true, data: option };
  reply.status(201).send(response);
}

async function updatePsychometricOption(
  request: FastifyRequest<{ Params: PsychometricOptionIdParams; Body: UpdatePsychometricOptionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const option = await questionBankService.updatePsychometricOption(
    request.params.id,
    request.params.versionId,
    request.params.optionId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof option> = { success: true, data: option };
  reply.status(200).send(response);
}

async function deletePsychometricOption(
  request: FastifyRequest<{ Params: PsychometricOptionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await questionBankService.deletePsychometricOption(
    request.params.id,
    request.params.versionId,
    request.params.optionId,
  );
  reply.status(204).send();
}

// --- Approval workflow (Part 3) ---

async function submitQuestionForApproval(
  request: FastifyRequest<{ Params: QuestionIdParams; Body: ApprovalActionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const performedBy = requireUserId(request);
  const question = await questionBankService.submitQuestionForApproval(
    request.params.id,
    performedBy,
    request.body,
  );
  const response: ApiSuccessResponse<typeof question> = { success: true, data: question };
  reply.status(200).send(response);
}

async function approveQuestion(
  request: FastifyRequest<{ Params: QuestionIdParams; Body: ApprovalActionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const performedBy = requireUserId(request);
  const question = await questionBankService.approveQuestion(
    request.params.id,
    performedBy,
    request.body,
  );
  const response: ApiSuccessResponse<typeof question> = { success: true, data: question };
  reply.status(200).send(response);
}

async function rejectQuestion(
  request: FastifyRequest<{ Params: QuestionIdParams; Body: ApprovalActionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const performedBy = requireUserId(request);
  const question = await questionBankService.rejectQuestion(
    request.params.id,
    performedBy,
    request.body,
  );
  const response: ApiSuccessResponse<typeof question> = { success: true, data: question };
  reply.status(200).send(response);
}

async function listQuestionApprovalHistory(
  request: FastifyRequest<{ Params: QuestionIdParams; Querystring: ListQuestionApprovalHistoryQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await questionBankService.listQuestionApprovalHistory(
    request.params.id,
    request.query,
  );
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

// --- Question pools (Part 3) ---

async function listQuestionPools(
  request: FastifyRequest<{ Querystring: ListQuestionPoolsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await questionBankService.listQuestionPools(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getQuestionPoolById(
  request: FastifyRequest<{ Params: QuestionPoolIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const pool = await questionBankService.findQuestionPoolById(request.params.id);
  const response: ApiSuccessResponse<typeof pool> = { success: true, data: pool };
  reply.status(200).send(response);
}

async function createQuestionPool(
  request: FastifyRequest<{ Body: CreateQuestionPoolInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const pool = await questionBankService.createQuestionPool(request.body, createdBy);
  const response: ApiSuccessResponse<typeof pool> = { success: true, data: pool };
  reply.status(201).send(response);
}

async function updateQuestionPool(
  request: FastifyRequest<{ Params: QuestionPoolIdParams; Body: UpdateQuestionPoolInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const pool = await questionBankService.updateQuestionPool(
    request.params.id,
    request.body,
    updatedBy,
  );
  const response: ApiSuccessResponse<typeof pool> = { success: true, data: pool };
  reply.status(200).send(response);
}

async function deleteQuestionPool(
  request: FastifyRequest<{ Params: QuestionPoolIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await questionBankService.deleteQuestionPool(request.params.id);
  reply.status(204).send();
}

// --- Question pool criteria (Part 3) ---

async function listQuestionPoolCriteria(
  request: FastifyRequest<{ Params: QuestionPoolIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const criteria = await questionBankService.listQuestionPoolCriteria(request.params.id);
  const response: ApiSuccessResponse<typeof criteria> = { success: true, data: criteria };
  reply.status(200).send(response);
}

async function createQuestionPoolCriteria(
  request: FastifyRequest<{ Params: QuestionPoolIdParams; Body: CreateQuestionPoolCriteriaInput }>,
  reply: FastifyReply,
): Promise<void> {
  const criteria = await questionBankService.createQuestionPoolCriteria(
    request.params.id,
    request.body,
  );
  const response: ApiSuccessResponse<typeof criteria> = { success: true, data: criteria };
  reply.status(201).send(response);
}

async function updateQuestionPoolCriteria(
  request: FastifyRequest<{
    Params: QuestionPoolCriteriaIdParams;
    Body: UpdateQuestionPoolCriteriaInput;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const criteria = await questionBankService.updateQuestionPoolCriteria(
    request.params.id,
    request.params.criteriaId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof criteria> = { success: true, data: criteria };
  reply.status(200).send(response);
}

async function deleteQuestionPoolCriteria(
  request: FastifyRequest<{ Params: QuestionPoolCriteriaIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await questionBankService.deleteQuestionPoolCriteria(
    request.params.id,
    request.params.criteriaId,
  );
  reply.status(204).send();
}

// --- Pool resolution (Part 3) ---

async function resolveQuestionPool(
  request: FastifyRequest<{ Params: QuestionPoolIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const resolved = await questionBankService.resolveQuestionPool(request.params.id);
  const response: ApiSuccessResponse<typeof resolved> = { success: true, data: resolved };
  reply.status(200).send(response);
}

export const questionBankController = {
  listQuestionCategories,
  getQuestionCategoryById,
  createQuestionCategory,
  updateQuestionCategory,
  deleteQuestionCategory,
  listQuestionTopics,
  getQuestionTopicById,
  createQuestionTopic,
  updateQuestionTopic,
  deleteQuestionTopic,
  listQuestionTags,
  getQuestionTagById,
  createQuestionTag,
  updateQuestionTag,
  deleteQuestionTag,
  listQuestions,
  getQuestionById,
  createQuestion,
  uploadQuestionImage,
  updateQuestion,
  deleteQuestion,
  listQuestionVersions,
  getQuestionVersionById,
  createQuestionVersion,
  activateQuestionVersion,
  getCodingQuestionDetails,
  createCodingQuestionDetails,
  updateCodingQuestionDetails,
  deleteCodingQuestionDetails,
  listCodingTestCases,
  createCodingTestCase,
  updateCodingTestCase,
  deleteCodingTestCase,
  getPsychometricDetails,
  createPsychometricDetails,
  updatePsychometricDetails,
  deletePsychometricDetails,
  listPsychometricOptions,
  createPsychometricOption,
  updatePsychometricOption,
  deletePsychometricOption,
  submitQuestionForApproval,
  approveQuestion,
  rejectQuestion,
  listQuestionApprovalHistory,
  listQuestionPools,
  getQuestionPoolById,
  createQuestionPool,
  updateQuestionPool,
  deleteQuestionPool,
  listQuestionPoolCriteria,
  createQuestionPoolCriteria,
  updateQuestionPoolCriteria,
  deleteQuestionPoolCriteria,
  resolveQuestionPool,
};
