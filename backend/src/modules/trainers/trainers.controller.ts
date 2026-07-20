import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { trainersService } from './trainers.service';
import type {
  CreateTrainerProfileInput,
  ListTrainerProfilesQuery,
  ListTrainersOverviewQuery,
  ListTrainingSessionsQuery,
  TrainerIdParams,
  TrainerProfileIdParams,
  UpdateTrainerProfileInput,
} from './trainers.schema';

function requireUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

async function listTrainerProfiles(
  request: FastifyRequest<{ Querystring: ListTrainerProfilesQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await trainersService.listTrainerProfiles(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getTrainerProfileById(
  request: FastifyRequest<{ Params: TrainerProfileIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const trainerProfile = await trainersService.findTrainerProfileById(request.params.id);
  const response: ApiSuccessResponse<typeof trainerProfile> = {
    success: true,
    data: trainerProfile,
  };
  reply.status(200).send(response);
}

async function createTrainerProfile(
  request: FastifyRequest<{ Body: CreateTrainerProfileInput }>,
  reply: FastifyReply,
): Promise<void> {
  const trainerProfile = await trainersService.createTrainerProfile(request.body);
  const response: ApiSuccessResponse<typeof trainerProfile> = {
    success: true,
    data: trainerProfile,
  };
  reply.status(201).send(response);
}

async function updateTrainerProfile(
  request: FastifyRequest<{ Params: TrainerProfileIdParams; Body: UpdateTrainerProfileInput }>,
  reply: FastifyReply,
): Promise<void> {
  const trainerProfile = await trainersService.updateTrainerProfile(
    request.params.id,
    request.body,
  );
  const response: ApiSuccessResponse<typeof trainerProfile> = {
    success: true,
    data: trainerProfile,
  };
  reply.status(200).send(response);
}

async function deleteTrainerProfile(
  request: FastifyRequest<{ Params: TrainerProfileIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await trainersService.deleteTrainerProfile(request.params.id);
  reply.status(204).send();
}

async function listTrainingSessions(
  request: FastifyRequest<{ Querystring: ListTrainingSessionsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await trainersService.listTrainingSessions(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function listTrainersOverview(
  request: FastifyRequest<{ Querystring: ListTrainersOverviewQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await trainersService.listTrainersOverview(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getTrainerPerformance(
  request: FastifyRequest<{ Params: TrainerIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const callerId = requireUserId(request);
  const result = await trainersService.getTrainerPerformance(request.params.trainerId, callerId);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

export const trainersController = {
  listTrainerProfiles,
  getTrainerProfileById,
  createTrainerProfile,
  updateTrainerProfile,
  deleteTrainerProfile,
  listTrainingSessions,
  listTrainersOverview,
  getTrainerPerformance,
};
