import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { analyticsService } from './analytics.service';
import type {
  BatchIdParams,
  BatchIdQuery,
  CollegeIdQuery,
  ExportBatchPerformanceQuery,
  GetBatchPerformanceQuery,
} from './analytics.schema';

function requireUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

async function getBatchPerformance(
  request: FastifyRequest<{ Params: BatchIdParams; Querystring: GetBatchPerformanceQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const result = await analyticsService.getBatchPerformance(
    request.params.batchId,
    request.query,
    userId,
  );
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getBatchAssessmentParticipation(
  request: FastifyRequest<{ Params: BatchIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const result = await analyticsService.getBatchAssessmentParticipation(
    request.params.batchId,
    userId,
  );
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

// Deliberately NOT the {success,data} envelope — raw CSV, same reasoning
// (and the same reason the frontend fetches this one directly rather than
// through the shared api/ client) as students.controller.ts's own
// exportStudentsCsv.
async function exportBatchPerformanceCsv(
  request: FastifyRequest<{ Params: BatchIdParams; Querystring: ExportBatchPerformanceQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const { csv, assessmentTitle } = await analyticsService.exportBatchPerformanceCsv(
    request.params.batchId,
    request.query.assessmentId,
    userId,
  );
  const safeTitle = assessmentTitle.replace(/[^a-z0-9-]+/gi, '-');
  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${safeTitle}-results.csv"`)
    .status(200)
    .send(csv);
}

async function exportBatchSummaryCsv(
  request: FastifyRequest<{ Params: BatchIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const { csv, batchName } = await analyticsService.exportBatchSummaryCsv(
    request.params.batchId,
    userId,
  );
  const safeName = batchName.replace(/[^a-z0-9-]+/gi, '-');
  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${safeName}-batch-summary.csv"`)
    .status(200)
    .send(csv);
}

// --- Super Admin platform analytics ---

async function getPlatformOverview(
  request: FastifyRequest<{ Querystring: CollegeIdQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const result = await analyticsService.getPlatformOverview(request.query.collegeId, userId);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getCollegePerformance(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const result = await analyticsService.getCollegePerformance(userId);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getCategoryImprovement(
  request: FastifyRequest<{ Querystring: CollegeIdQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const result = await analyticsService.getCategoryImprovement(request.query.collegeId, userId);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

// --- Faculty's own analytics (Phase 3) ---

async function getMyOverview(
  request: FastifyRequest<{ Querystring: BatchIdQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const result = await analyticsService.getMyOverview(userId, request.query.batchId);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getMyBatchPerformance(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = requireUserId(request);
  const result = await analyticsService.getMyBatchPerformance(userId);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getMyCategoryImprovement(
  request: FastifyRequest<{ Querystring: BatchIdQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const result = await analyticsService.getMyCategoryImprovement(userId, request.query.batchId);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

export const analyticsController = {
  getBatchPerformance,
  getBatchAssessmentParticipation,
  exportBatchPerformanceCsv,
  exportBatchSummaryCsv,
  getPlatformOverview,
  getCollegePerformance,
  getCategoryImprovement,
  getMyOverview,
  getMyBatchPerformance,
  getMyCategoryImprovement,
};
