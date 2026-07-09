import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { studentsService } from './students.service';
import type {
  CreateStudentProfileInput,
  ListStudentProfilesQuery,
  StudentProfileIdParams,
  UpdateStudentProfileInput,
} from './students.schema';

// student_profiles has created_by/updated_by columns (unlike
// trainer_profiles, which has neither) — this helper is needed here even
// though trainers.controller.ts didn't need one.
function requireUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

async function listStudentProfiles(
  request: FastifyRequest<{ Querystring: ListStudentProfilesQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await studentsService.listStudentProfiles(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getStudentProfileById(
  request: FastifyRequest<{ Params: StudentProfileIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const studentProfile = await studentsService.findStudentProfileById(request.params.id);
  const response: ApiSuccessResponse<typeof studentProfile> = {
    success: true,
    data: studentProfile,
  };
  reply.status(200).send(response);
}

async function createStudentProfile(
  request: FastifyRequest<{ Body: CreateStudentProfileInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const studentProfile = await studentsService.createStudentProfile(request.body, createdBy);
  const response: ApiSuccessResponse<typeof studentProfile> = {
    success: true,
    data: studentProfile,
  };
  reply.status(201).send(response);
}

async function updateStudentProfile(
  request: FastifyRequest<{ Params: StudentProfileIdParams; Body: UpdateStudentProfileInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const studentProfile = await studentsService.updateStudentProfile(
    request.params.id,
    request.body,
    updatedBy,
  );
  const response: ApiSuccessResponse<typeof studentProfile> = {
    success: true,
    data: studentProfile,
  };
  reply.status(200).send(response);
}

async function archiveStudentProfile(
  request: FastifyRequest<{ Params: StudentProfileIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  await studentsService.archiveStudentProfile(request.params.id, updatedBy);
  reply.status(204).send();
}

export const studentsController = {
  listStudentProfiles,
  getStudentProfileById,
  createStudentProfile,
  updateStudentProfile,
  archiveStudentProfile,
};
