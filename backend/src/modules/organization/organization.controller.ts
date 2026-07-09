import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { organizationService } from './organization.service';
import type {
  AcademicYearIdParams,
  AssignTrainingProgramTrainerInput,
  BatchIdParams,
  CollegeIdParams,
  CreateAcademicYearInput,
  CreateBatchInput,
  CreateCollegeInput,
  CreateDepartmentInput,
  CreateTrainingProgramInput,
  DepartmentIdParams,
  ListAcademicYearsQuery,
  ListBatchesQuery,
  ListCollegesQuery,
  ListDepartmentsQuery,
  ListTrainingProgramTrainersQuery,
  ListTrainingProgramsQuery,
  TrainingProgramIdParams,
  TrainingProgramTrainerParams,
  UpdateAcademicYearInput,
  UpdateBatchInput,
  UpdateCollegeInput,
  UpdateDepartmentInput,
  UpdateTrainingProgramInput,
} from './organization.schema';

function requireUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

// --- Colleges ---

async function listColleges(
  request: FastifyRequest<{ Querystring: ListCollegesQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await organizationService.listColleges(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getCollegeById(
  request: FastifyRequest<{ Params: CollegeIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const college = await organizationService.findCollegeById(request.params.id);
  const response: ApiSuccessResponse<typeof college> = { success: true, data: college };
  reply.status(200).send(response);
}

async function createCollege(
  request: FastifyRequest<{ Body: CreateCollegeInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const college = await organizationService.createCollege(request.body, createdBy);
  const response: ApiSuccessResponse<typeof college> = { success: true, data: college };
  reply.status(201).send(response);
}

async function updateCollege(
  request: FastifyRequest<{ Params: CollegeIdParams; Body: UpdateCollegeInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const college = await organizationService.updateCollege(
    request.params.id,
    request.body,
    updatedBy,
  );
  const response: ApiSuccessResponse<typeof college> = { success: true, data: college };
  reply.status(200).send(response);
}

async function deleteCollege(
  request: FastifyRequest<{ Params: CollegeIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await organizationService.deleteCollege(request.params.id);
  reply.status(204).send();
}

// --- Departments ---

async function listDepartments(
  request: FastifyRequest<{ Querystring: ListDepartmentsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await organizationService.listDepartments(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getDepartmentById(
  request: FastifyRequest<{ Params: DepartmentIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const department = await organizationService.findDepartmentById(request.params.id);
  const response: ApiSuccessResponse<typeof department> = { success: true, data: department };
  reply.status(200).send(response);
}

async function createDepartment(
  request: FastifyRequest<{ Body: CreateDepartmentInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const department = await organizationService.createDepartment(request.body, createdBy);
  const response: ApiSuccessResponse<typeof department> = { success: true, data: department };
  reply.status(201).send(response);
}

async function updateDepartment(
  request: FastifyRequest<{ Params: DepartmentIdParams; Body: UpdateDepartmentInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const department = await organizationService.updateDepartment(
    request.params.id,
    request.body,
    updatedBy,
  );
  const response: ApiSuccessResponse<typeof department> = { success: true, data: department };
  reply.status(200).send(response);
}

async function deleteDepartment(
  request: FastifyRequest<{ Params: DepartmentIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await organizationService.deleteDepartment(request.params.id);
  reply.status(204).send();
}

// --- Academic years ---

async function listAcademicYears(
  request: FastifyRequest<{ Querystring: ListAcademicYearsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await organizationService.listAcademicYears(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getAcademicYearById(
  request: FastifyRequest<{ Params: AcademicYearIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const academicYear = await organizationService.findAcademicYearById(request.params.id);
  const response: ApiSuccessResponse<typeof academicYear> = { success: true, data: academicYear };
  reply.status(200).send(response);
}

async function createAcademicYear(
  request: FastifyRequest<{ Body: CreateAcademicYearInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const academicYear = await organizationService.createAcademicYear(request.body, createdBy);
  const response: ApiSuccessResponse<typeof academicYear> = { success: true, data: academicYear };
  reply.status(201).send(response);
}

async function updateAcademicYear(
  request: FastifyRequest<{ Params: AcademicYearIdParams; Body: UpdateAcademicYearInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const academicYear = await organizationService.updateAcademicYear(
    request.params.id,
    request.body,
    updatedBy,
  );
  const response: ApiSuccessResponse<typeof academicYear> = { success: true, data: academicYear };
  reply.status(200).send(response);
}

// --- Training programs ---

async function listTrainingPrograms(
  request: FastifyRequest<{ Querystring: ListTrainingProgramsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await organizationService.listTrainingPrograms(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getTrainingProgramById(
  request: FastifyRequest<{ Params: TrainingProgramIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const trainingProgram = await organizationService.findTrainingProgramById(request.params.id);
  const response: ApiSuccessResponse<typeof trainingProgram> = {
    success: true,
    data: trainingProgram,
  };
  reply.status(200).send(response);
}

async function createTrainingProgram(
  request: FastifyRequest<{ Body: CreateTrainingProgramInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const trainingProgram = await organizationService.createTrainingProgram(
    request.body,
    createdBy,
  );
  const response: ApiSuccessResponse<typeof trainingProgram> = {
    success: true,
    data: trainingProgram,
  };
  reply.status(201).send(response);
}

async function updateTrainingProgram(
  request: FastifyRequest<{ Params: TrainingProgramIdParams; Body: UpdateTrainingProgramInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const trainingProgram = await organizationService.updateTrainingProgram(
    request.params.id,
    request.body,
    updatedBy,
  );
  const response: ApiSuccessResponse<typeof trainingProgram> = {
    success: true,
    data: trainingProgram,
  };
  reply.status(200).send(response);
}

async function deleteTrainingProgram(
  request: FastifyRequest<{ Params: TrainingProgramIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await organizationService.deleteTrainingProgram(request.params.id);
  reply.status(204).send();
}

// --- Training program trainers ---

async function listTrainingProgramTrainers(
  request: FastifyRequest<{
    Params: TrainingProgramIdParams;
    Querystring: ListTrainingProgramTrainersQuery;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await organizationService.listTrainingProgramTrainers(
    request.params.id,
    request.query,
  );
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function assignTrainingProgramTrainer(
  request: FastifyRequest<{
    Params: TrainingProgramIdParams;
    Body: AssignTrainingProgramTrainerInput;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const assignment = await organizationService.assignTrainingProgramTrainer(
    request.params.id,
    request.body,
  );
  const response: ApiSuccessResponse<typeof assignment> = { success: true, data: assignment };
  reply.status(201).send(response);
}

async function removeTrainingProgramTrainer(
  request: FastifyRequest<{ Params: TrainingProgramTrainerParams }>,
  reply: FastifyReply,
): Promise<void> {
  await organizationService.removeTrainingProgramTrainer(
    request.params.id,
    request.params.trainerId,
  );
  reply.status(204).send();
}

// --- Batches ---

async function listBatches(
  request: FastifyRequest<{ Querystring: ListBatchesQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await organizationService.listBatches(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getBatchById(
  request: FastifyRequest<{ Params: BatchIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const batch = await organizationService.findBatchById(request.params.id);
  const response: ApiSuccessResponse<typeof batch> = { success: true, data: batch };
  reply.status(200).send(response);
}

async function createBatch(
  request: FastifyRequest<{ Body: CreateBatchInput }>,
  reply: FastifyReply,
): Promise<void> {
  const createdBy = requireUserId(request);
  const batch = await organizationService.createBatch(request.body, createdBy);
  const response: ApiSuccessResponse<typeof batch> = { success: true, data: batch };
  reply.status(201).send(response);
}

async function updateBatch(
  request: FastifyRequest<{ Params: BatchIdParams; Body: UpdateBatchInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const batch = await organizationService.updateBatch(request.params.id, request.body, updatedBy);
  const response: ApiSuccessResponse<typeof batch> = { success: true, data: batch };
  reply.status(200).send(response);
}

async function deleteBatch(
  request: FastifyRequest<{ Params: BatchIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await organizationService.deleteBatch(request.params.id);
  reply.status(204).send();
}

export const organizationController = {
  listColleges,
  getCollegeById,
  createCollege,
  updateCollege,
  deleteCollege,
  listDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listAcademicYears,
  getAcademicYearById,
  createAcademicYear,
  updateAcademicYear,
  listTrainingPrograms,
  getTrainingProgramById,
  createTrainingProgram,
  updateTrainingProgram,
  deleteTrainingProgram,
  listTrainingProgramTrainers,
  assignTrainingProgramTrainer,
  removeTrainingProgramTrainer,
  listBatches,
  getBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
};
