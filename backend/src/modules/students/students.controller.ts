import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { studentsService } from './students.service';
import type {
  BatchStudentsParams,
  CreateStudentProfileInput,
  CreateStudentsInBatchInput,
  ExportBatchStudentsQuery,
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

// Same helper as analytics.controller.ts's/organization.controller.ts's own
// requireActiveCollegeId — null means a global (Super Admin) grant,
// non-null means a college-scoped caller (Faculty).
function requireActiveCollegeId(request: FastifyRequest): string | null {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.activeCollegeId ?? null;
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

async function createStudentsInBatch(
  request: FastifyRequest<{ Params: BatchStudentsParams; Body: CreateStudentsInBatchInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const activeCollegeId = requireActiveCollegeId(request);
  const result = await studentsService.createStudentsInBatch(
    request.params.id,
    request.body,
    activeCollegeId,
    createdBy,
  );
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(201).send(response);
}

// Deliberately NOT the {success,data} envelope every other endpoint in this
// codebase returns — this sends a raw CSV file. The frontend's shared api/
// client unwraps every response assuming that envelope (see api/index.ts's
// response interceptor), so this endpoint can't go through it; the
// frontend fetches this one directly instead (see features/students/api.ts).
async function exportStudentsCsv(
  request: FastifyRequest<{ Params: BatchStudentsParams; Querystring: ExportBatchStudentsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const activeCollegeId = requireActiveCollegeId(request);
  const csv = await studentsService.exportStudentsCsv(request.params.id, request.query, activeCollegeId);
  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="batch-${request.params.id}-students.csv"`)
    .status(200)
    .send(csv);
}

export const studentsController = {
  listStudentProfiles,
  getStudentProfileById,
  createStudentProfile,
  updateStudentProfile,
  archiveStudentProfile,
  createStudentsInBatch,
  exportStudentsCsv,
};
