import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SubmitCodeInput } from '../coding/coding.schema';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { attemptsService } from './attempts.service';
import type {
  AttemptIdParams,
  AttemptResponseParams,
  CreateRetakeRequestInput,
  ListMyAttemptsQuery,
  ListRetakeRequestsQuery,
  RecordProctoringEventInput,
  RetakeRequestIdParams,
  StartAttemptInput,
  SubmitResponseInput,
} from './attempts.schema';

function requireUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

async function startAttempt(
  request: FastifyRequest<{ Body: StartAttemptInput }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const attempt = await attemptsService.startAttempt(userId, request.body.assessmentId, {
    ipAddress: request.ip,
    browserInfo: request.headers['user-agent'],
  });
  const response: ApiSuccessResponse<typeof attempt> = { success: true, data: attempt };
  reply.status(201).send(response);
}

async function listMyAttempts(
  request: FastifyRequest<{ Querystring: ListMyAttemptsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const attempts = await attemptsService.listMyAttempts(userId, request.query.assessmentId);
  const response: ApiSuccessResponse<typeof attempts> = { success: true, data: attempts };
  reply.status(200).send(response);
}

async function getAttemptById(
  request: FastifyRequest<{ Params: AttemptIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const attempt = await attemptsService.getAttemptById(userId, request.params.attemptId);
  const response: ApiSuccessResponse<typeof attempt> = { success: true, data: attempt };
  reply.status(200).send(response);
}

async function getAttemptQuestions(
  request: FastifyRequest<{ Params: AttemptIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const questions = await attemptsService.getAttemptQuestions(userId, request.params.attemptId);
  const response: ApiSuccessResponse<typeof questions> = { success: true, data: questions };
  reply.status(200).send(response);
}

async function submitResponse(
  request: FastifyRequest<{ Params: AttemptResponseParams; Body: SubmitResponseInput }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const response = await attemptsService.submitResponse(
    userId,
    request.params.attemptId,
    request.params.questionVersionId,
    request.body,
  );
  const apiResponse: ApiSuccessResponse<typeof response> = { success: true, data: response };
  reply.status(200).send(apiResponse);
}

async function submitCode(
  request: FastifyRequest<{ Params: AttemptResponseParams; Body: SubmitCodeInput }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const response = await attemptsService.submitCode(
    userId,
    request.params.attemptId,
    request.params.questionVersionId,
    request.body,
  );
  const apiResponse: ApiSuccessResponse<typeof response> = { success: true, data: response };
  reply.status(200).send(apiResponse);
}

async function submitAttempt(
  request: FastifyRequest<{ Params: AttemptIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const attempt = await attemptsService.submitAttempt(userId, request.params.attemptId);
  const response: ApiSuccessResponse<typeof attempt> = { success: true, data: attempt };
  reply.status(200).send(response);
}

// --- Proctoring events (Part 2) ---

async function recordProctoringEvent(
  request: FastifyRequest<{ Params: AttemptIdParams; Body: RecordProctoringEventInput }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const event = await attemptsService.recordProctoringEvent(
    userId,
    request.params.attemptId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof event> = { success: true, data: event };
  reply.status(201).send(response);
}

async function listProctoringEvents(
  request: FastifyRequest<{ Params: AttemptIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const events = await attemptsService.listProctoringEvents(request.params.attemptId);
  const response: ApiSuccessResponse<typeof events> = { success: true, data: events };
  reply.status(200).send(response);
}

// --- Retake requests (Part 2) ---

async function createRetakeRequest(
  request: FastifyRequest<{ Params: AttemptIdParams; Body: CreateRetakeRequestInput }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const retakeRequest = await attemptsService.createRetakeRequest(
    userId,
    request.params.attemptId,
    request.body,
  );
  const response: ApiSuccessResponse<typeof retakeRequest> = { success: true, data: retakeRequest };
  reply.status(201).send(response);
}

async function listRetakeRequests(
  request: FastifyRequest<{ Querystring: ListRetakeRequestsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await attemptsService.listRetakeRequests(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function approveRetakeRequest(
  request: FastifyRequest<{ Params: RetakeRequestIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const retakeRequest = await attemptsService.approveRetakeRequest(
    request.params.retakeRequestId,
    userId,
  );
  const response: ApiSuccessResponse<typeof retakeRequest> = { success: true, data: retakeRequest };
  reply.status(200).send(response);
}

async function rejectRetakeRequest(
  request: FastifyRequest<{ Params: RetakeRequestIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const retakeRequest = await attemptsService.rejectRetakeRequest(
    request.params.retakeRequestId,
    userId,
  );
  const response: ApiSuccessResponse<typeof retakeRequest> = { success: true, data: retakeRequest };
  reply.status(200).send(response);
}

export const attemptsController = {
  startAttempt,
  listMyAttempts,
  getAttemptById,
  getAttemptQuestions,
  submitResponse,
  submitCode,
  submitAttempt,
  recordProctoringEvent,
  listProctoringEvents,
  createRetakeRequest,
  listRetakeRequests,
  approveRetakeRequest,
  rejectRetakeRequest,
};
