import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { assessmentsService } from './assessments.service';
import type {
  AssessmentApprovalActionInput,
  AssessmentIdParams,
  AssessmentQuestionIdParams,
  AssessmentSectionIdParams,
  AssessmentSectionPoolIdParams,
  CreateAssessmentInput,
  CreateAssessmentQuestionInput,
  CreateAssessmentSectionInput,
  CreateAssessmentSectionPoolInput,
  ListAssessmentApprovalHistoryQuery,
  ListAssessmentsQuery,
  UpdateAssessmentInput,
  UpdateAssessmentQuestionInput,
  UpdateAssessmentSectionInput,
} from './assessments.schema';

function requireUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

// --- Assessments ---

async function listAssessments(
  request: FastifyRequest<{ Querystring: ListAssessmentsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await assessmentsService.listAssessments(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

// Returns the assessment row plus its currently-linked batchIds — see
// assessments.service.ts's module comment on why assessment_batches rides
// alongside the assessment rather than its own resource.
async function getAssessmentById(
  request: FastifyRequest<{ Params: AssessmentIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const assessment = await assessmentsService.findAssessmentWithBatches(request.params.id);
  const response: ApiSuccessResponse<typeof assessment> = { success: true, data: assessment };
  reply.status(200).send(response);
}

async function createAssessment(
  request: FastifyRequest<{ Body: CreateAssessmentInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const assessment = await assessmentsService.createAssessment(request.body, createdBy);
  const response: ApiSuccessResponse<typeof assessment> = { success: true, data: assessment };
  reply.status(201).send(response);
}

async function updateAssessment(
  request: FastifyRequest<{ Params: AssessmentIdParams; Body: UpdateAssessmentInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const assessment = await assessmentsService.updateAssessment(
    request.params.id,
    request.body,
    updatedBy,
  );
  const response: ApiSuccessResponse<typeof assessment> = { success: true, data: assessment };
  reply.status(200).send(response);
}

async function deleteAssessment(
  request: FastifyRequest<{ Params: AssessmentIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await assessmentsService.deleteAssessment(request.params.id);
  reply.status(204).send();
}

async function listAssessmentBatches(
  request: FastifyRequest<{ Params: AssessmentIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const batchIds = await assessmentsService.listAssessmentBatches(request.params.id);
  const response: ApiSuccessResponse<typeof batchIds> = { success: true, data: batchIds };
  reply.status(200).send(response);
}

// --- Assessment sections ---

async function listAssessmentSections(
  request: FastifyRequest<{ Params: AssessmentIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const sections = await assessmentsService.listAssessmentSections(request.params.id);
  const response: ApiSuccessResponse<typeof sections> = { success: true, data: sections };
  reply.status(200).send(response);
}

async function getAssessmentSectionById(
  request: FastifyRequest<{ Params: AssessmentSectionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const section = await assessmentsService.findAssessmentSectionById(
    request.params.id,
    request.params.sectionId,
  );
  const response: ApiSuccessResponse<typeof section> = { success: true, data: section };
  reply.status(200).send(response);
}

async function createAssessmentSection(
  request: FastifyRequest<{ Params: AssessmentIdParams; Body: CreateAssessmentSectionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const section = await assessmentsService.createAssessmentSection(
    request.params.id,
    request.body,
    createdBy,
  );
  const response: ApiSuccessResponse<typeof section> = { success: true, data: section };
  reply.status(201).send(response);
}

async function updateAssessmentSection(
  request: FastifyRequest<{ Params: AssessmentSectionIdParams; Body: UpdateAssessmentSectionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const section = await assessmentsService.updateAssessmentSection(
    request.params.id,
    request.params.sectionId,
    request.body,
    updatedBy,
  );
  const response: ApiSuccessResponse<typeof section> = { success: true, data: section };
  reply.status(200).send(response);
}

async function deleteAssessmentSection(
  request: FastifyRequest<{ Params: AssessmentSectionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await assessmentsService.deleteAssessmentSection(request.params.id, request.params.sectionId);
  reply.status(204).send();
}

// --- Assessment questions (manual selection_mode) ---

async function listAssessmentQuestions(
  request: FastifyRequest<{ Params: AssessmentSectionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const questions = await assessmentsService.listAssessmentQuestions(
    request.params.id,
    request.params.sectionId,
  );
  const response: ApiSuccessResponse<typeof questions> = { success: true, data: questions };
  reply.status(200).send(response);
}

async function createAssessmentQuestion(
  request: FastifyRequest<{
    Params: AssessmentSectionIdParams;
    Body: CreateAssessmentQuestionInput;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const question = await assessmentsService.createAssessmentQuestion(
    request.params.id,
    request.params.sectionId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof question> = { success: true, data: question };
  reply.status(201).send(response);
}

async function updateAssessmentQuestion(
  request: FastifyRequest<{
    Params: AssessmentQuestionIdParams;
    Body: UpdateAssessmentQuestionInput;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const question = await assessmentsService.updateAssessmentQuestion(
    request.params.id,
    request.params.sectionId,
    request.params.questionId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof question> = { success: true, data: question };
  reply.status(200).send(response);
}

async function deleteAssessmentQuestion(
  request: FastifyRequest<{ Params: AssessmentQuestionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await assessmentsService.deleteAssessmentQuestion(
    request.params.id,
    request.params.sectionId,
    request.params.questionId,
  );
  reply.status(204).send();
}

// --- Assessment section pools (pool selection_mode) ---

async function listAssessmentSectionPools(
  request: FastifyRequest<{ Params: AssessmentSectionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const pools = await assessmentsService.listAssessmentSectionPools(
    request.params.id,
    request.params.sectionId,
  );
  const response: ApiSuccessResponse<typeof pools> = { success: true, data: pools };
  reply.status(200).send(response);
}

async function createAssessmentSectionPool(
  request: FastifyRequest<{
    Params: AssessmentSectionIdParams;
    Body: CreateAssessmentSectionPoolInput;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const pool = await assessmentsService.createAssessmentSectionPool(
    request.params.id,
    request.params.sectionId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof pool> = { success: true, data: pool };
  reply.status(201).send(response);
}

async function deleteAssessmentSectionPool(
  request: FastifyRequest<{ Params: AssessmentSectionPoolIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await assessmentsService.deleteAssessmentSectionPool(
    request.params.id,
    request.params.sectionId,
    request.params.poolId,
  );
  reply.status(204).send();
}

// --- Resolve ---

async function resolveSectionQuestions(
  request: FastifyRequest<{ Params: AssessmentSectionIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const resolved = await assessmentsService.resolveSectionQuestions(
    request.params.id,
    request.params.sectionId,
  );
  const response: ApiSuccessResponse<typeof resolved> = { success: true, data: resolved };
  reply.status(200).send(response);
}

// --- Approval workflow ---

async function submitAssessment(
  request: FastifyRequest<{ Params: AssessmentIdParams; Body: AssessmentApprovalActionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const performedBy = requireUserId(request);
  const assessment = await assessmentsService.submitAssessment(
    request.params.id,
    performedBy,
    request.body,
  );
  const response: ApiSuccessResponse<typeof assessment> = { success: true, data: assessment };
  reply.status(200).send(response);
}

async function approveAssessment(
  request: FastifyRequest<{ Params: AssessmentIdParams; Body: AssessmentApprovalActionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const performedBy = requireUserId(request);
  const assessment = await assessmentsService.approveAssessment(
    request.params.id,
    performedBy,
    request.body,
  );
  const response: ApiSuccessResponse<typeof assessment> = { success: true, data: assessment };
  reply.status(200).send(response);
}

async function rejectAssessment(
  request: FastifyRequest<{ Params: AssessmentIdParams; Body: AssessmentApprovalActionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const performedBy = requireUserId(request);
  const assessment = await assessmentsService.rejectAssessment(
    request.params.id,
    performedBy,
    request.body,
  );
  const response: ApiSuccessResponse<typeof assessment> = { success: true, data: assessment };
  reply.status(200).send(response);
}

async function scheduleAssessment(
  request: FastifyRequest<{ Params: AssessmentIdParams; Body: AssessmentApprovalActionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const performedBy = requireUserId(request);
  const assessment = await assessmentsService.scheduleAssessment(
    request.params.id,
    performedBy,
    request.body,
  );
  const response: ApiSuccessResponse<typeof assessment> = { success: true, data: assessment };
  reply.status(200).send(response);
}

async function publishAssessment(
  request: FastifyRequest<{ Params: AssessmentIdParams; Body: AssessmentApprovalActionInput }>,
  reply: FastifyReply,
): Promise<void> {
  const performedBy = requireUserId(request);
  const assessment = await assessmentsService.publishAssessment(
    request.params.id,
    performedBy,
    request.body,
  );
  const response: ApiSuccessResponse<typeof assessment> = { success: true, data: assessment };
  reply.status(200).send(response);
}

async function listAssessmentApprovalHistory(
  request: FastifyRequest<{
    Params: AssessmentIdParams;
    Querystring: ListAssessmentApprovalHistoryQuery;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await assessmentsService.listAssessmentApprovalHistory(
    request.params.id,
    request.query,
  );
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

export const assessmentsController = {
  listAssessments,
  getAssessmentById,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  listAssessmentBatches,
  listAssessmentSections,
  getAssessmentSectionById,
  createAssessmentSection,
  updateAssessmentSection,
  deleteAssessmentSection,
  listAssessmentQuestions,
  createAssessmentQuestion,
  updateAssessmentQuestion,
  deleteAssessmentQuestion,
  listAssessmentSectionPools,
  createAssessmentSectionPool,
  deleteAssessmentSectionPool,
  resolveSectionQuestions,
  submitAssessment,
  approveAssessment,
  rejectAssessment,
  scheduleAssessment,
  publishAssessment,
  listAssessmentApprovalHistory,
};
