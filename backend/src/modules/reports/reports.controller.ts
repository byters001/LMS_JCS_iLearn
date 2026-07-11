import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { reportsService } from './reports.service';
import type { AttemptIdParams, ListMyAttemptsQuery } from './reports.schema';

function requireUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

async function listMyAttempts(
  request: FastifyRequest<{ Querystring: ListMyAttemptsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const result = await reportsService.listMyAttempts(userId, request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getMyAttemptDetail(
  request: FastifyRequest<{ Params: AttemptIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const detail = await reportsService.getMyAttemptDetail(userId, request.params.attemptId);
  const response: ApiSuccessResponse<typeof detail> = { success: true, data: detail };
  reply.status(200).send(response);
}

export const reportsController = {
  listMyAttempts,
  getMyAttemptDetail,
};
