import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { questionBankService } from './question-bank.service';
import type {
  CreateQuestionCategoryInput,
  CreateQuestionInput,
  CreateQuestionTagInput,
  CreateQuestionTopicInput,
  CreateQuestionVersionInput,
  ListQuestionCategoriesQuery,
  ListQuestionTagsQuery,
  ListQuestionTopicsQuery,
  ListQuestionsQuery,
  QuestionCategoryIdParams,
  QuestionIdParams,
  QuestionTagIdParams,
  QuestionTopicIdParams,
  QuestionVersionIdParams,
  UpdateQuestionCategoryInput,
  UpdateQuestionInput,
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
  const result = await questionBankService.listQuestions(request.query);
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
  updateQuestion,
  deleteQuestion,
  listQuestionVersions,
  getQuestionVersionById,
  createQuestionVersion,
  activateQuestionVersion,
};
