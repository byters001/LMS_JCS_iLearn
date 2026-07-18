import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { analyticsService } from './analytics.service';
import type { BatchIdParams, GetBatchPerformanceQuery } from './analytics.schema';

function requireActiveCollegeId(request: FastifyRequest): string | null {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.activeCollegeId ?? null;
}

async function getBatchPerformance(
  request: FastifyRequest<{ Params: BatchIdParams; Querystring: GetBatchPerformanceQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const activeCollegeId = requireActiveCollegeId(request);
  const result = await analyticsService.getBatchPerformance(
    request.params.batchId,
    request.query,
    activeCollegeId,
  );
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getBatchAssessmentParticipation(
  request: FastifyRequest<{ Params: BatchIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const activeCollegeId = requireActiveCollegeId(request);
  const result = await analyticsService.getBatchAssessmentParticipation(
    request.params.batchId,
    activeCollegeId,
  );
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

export const analyticsController = {
  getBatchPerformance,
  getBatchAssessmentParticipation,
};
