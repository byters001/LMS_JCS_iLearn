import type { AcademicYear, Batch, College, Department, TrainingProgram, TrainingProgramTrainer } from '../../db/types';
import { usersService } from '../users/users.service';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { organizationRepository } from './organization.repository';
import type {
  AssignTrainingProgramTrainerInput,
  CreateAcademicYearInput,
  CreateBatchInput,
  CreateCollegeInput,
  CreateDepartmentInput,
  CreateTrainingProgramInput,
  ListAcademicYearsQuery,
  ListBatchesQuery,
  ListCollegesQuery,
  ListDepartmentsQuery,
  ListTrainingProgramTrainersQuery,
  ListTrainingProgramsQuery,
  UpdateAcademicYearInput,
  UpdateBatchInput,
  UpdateCollegeInput,
  UpdateDepartmentInput,
  UpdateTrainingProgramInput,
} from './organization.schema';
import type {
  ListAcademicYearsResult,
  ListBatchesResult,
  ListCollegesResult,
  ListDepartmentsResult,
  ListTrainingProgramTrainersResult,
  ListTrainingProgramsResult,
} from './organization.types';

// --- Colleges ---

async function listColleges(query: ListCollegesQuery): Promise<ListCollegesResult> {
  const { items, total } = await organizationRepository.listColleges({
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findCollegeById(id: string): Promise<College> {
  const college = await organizationRepository.findCollegeById(id);
  if (!college) {
    throw new NotFoundError('College not found');
  }
  return college;
}

async function createCollege(input: CreateCollegeInput, createdBy: string): Promise<College> {
  // colleges.code has a plain UNIQUE constraint in schema.sql — pre-checking
  // avoids letting a raw Postgres unique-violation error escape this service
  // (CLAUDE.md: services must throw only AppError subclasses).
  const existing = await organizationRepository.findCollegeByCode(input.code);
  if (existing) {
    throw new ConflictError('A college with this code already exists');
  }

  return organizationRepository.createCollege({ ...input, createdBy });
}

async function updateCollege(
  id: string,
  input: UpdateCollegeInput,
  updatedBy: string,
): Promise<College> {
  const existing = await organizationRepository.findCollegeById(id);
  if (!existing) {
    throw new NotFoundError('College not found');
  }

  if (input.code && input.code !== existing.code) {
    const codeOwner = await organizationRepository.findCollegeByCode(input.code);
    if (codeOwner && codeOwner.id !== id) {
      throw new ConflictError('A college with this code already exists');
    }
  }

  const updated = await organizationRepository.updateCollege(id, { ...input, updatedBy });
  if (!updated) {
    throw new NotFoundError('College not found');
  }
  return updated;
}

async function deleteCollege(id: string): Promise<void> {
  const existing = await organizationRepository.findCollegeById(id);
  if (!existing) {
    throw new NotFoundError('College not found');
  }
  await organizationRepository.deleteCollege(id);
}

// --- Departments ---

async function listDepartments(query: ListDepartmentsQuery): Promise<ListDepartmentsResult> {
  const { items, total } = await organizationRepository.listDepartments({
    collegeId: query.collegeId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findDepartmentById(id: string): Promise<Department> {
  const department = await organizationRepository.findDepartmentById(id);
  if (!department) {
    throw new NotFoundError('Department not found');
  }
  return department;
}

async function createDepartment(
  input: CreateDepartmentInput,
  createdBy: string,
): Promise<Department> {
  // Cross-entity check: a department can't be created under a college that
  // doesn't exist or is soft-deleted. findCollegeById already excludes
  // soft-deleted rows, so this one call covers both cases.
  const college = await organizationRepository.findCollegeById(input.collegeId);
  if (!college) {
    throw new NotFoundError('College not found');
  }

  return organizationRepository.createDepartment({ ...input, createdBy });
}

async function updateDepartment(
  id: string,
  input: UpdateDepartmentInput,
  updatedBy: string,
): Promise<Department> {
  const existing = await organizationRepository.findDepartmentById(id);
  if (!existing) {
    throw new NotFoundError('Department not found');
  }

  const updated = await organizationRepository.updateDepartment(id, { ...input, updatedBy });
  if (!updated) {
    throw new NotFoundError('Department not found');
  }
  return updated;
}

async function deleteDepartment(id: string): Promise<void> {
  const existing = await organizationRepository.findDepartmentById(id);
  if (!existing) {
    throw new NotFoundError('Department not found');
  }
  await organizationRepository.deleteDepartment(id);
}

// --- Academic years ---

async function listAcademicYears(
  query: ListAcademicYearsQuery,
): Promise<ListAcademicYearsResult> {
  const { items, total } = await organizationRepository.listAcademicYears({
    collegeId: query.collegeId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findAcademicYearById(id: string): Promise<AcademicYear> {
  const academicYear = await organizationRepository.findAcademicYearById(id);
  if (!academicYear) {
    throw new NotFoundError('Academic year not found');
  }
  return academicYear;
}

async function createAcademicYear(
  input: CreateAcademicYearInput,
  createdBy: string,
): Promise<AcademicYear> {
  // Same cross-entity check as createDepartment: no academic year under a
  // college that doesn't exist or is soft-deleted.
  const college = await organizationRepository.findCollegeById(input.collegeId);
  if (!college) {
    throw new NotFoundError('College not found');
  }

  return organizationRepository.createAcademicYear({ ...input, createdBy });
}

async function updateAcademicYear(
  id: string,
  input: UpdateAcademicYearInput,
  updatedBy: string,
): Promise<AcademicYear> {
  const existing = await organizationRepository.findAcademicYearById(id);
  if (!existing) {
    throw new NotFoundError('Academic year not found');
  }

  const updated = await organizationRepository.updateAcademicYear(id, { ...input, updatedBy });
  if (!updated) {
    throw new NotFoundError('Academic year not found');
  }
  return updated;
}

// --- Training programs ---

async function listTrainingPrograms(
  query: ListTrainingProgramsQuery,
): Promise<ListTrainingProgramsResult> {
  const { items, total } = await organizationRepository.listTrainingPrograms({
    collegeId: query.collegeId,
    departmentId: query.departmentId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findTrainingProgramById(id: string): Promise<TrainingProgram> {
  const trainingProgram = await organizationRepository.findTrainingProgramById(id);
  if (!trainingProgram) {
    throw new NotFoundError('Training program not found');
  }
  return trainingProgram;
}

async function createTrainingProgram(
  input: CreateTrainingProgramInput,
  createdBy: string,
): Promise<TrainingProgram> {
  const college = await organizationRepository.findCollegeById(input.collegeId);
  if (!college) {
    throw new NotFoundError('College not found');
  }

  const department = await organizationRepository.findDepartmentById(input.departmentId);
  if (!department) {
    throw new NotFoundError('Department not found');
  }
  // Cross-entity consistency check beyond plain existence: college_id and
  // department_id are independent FK columns in schema.sql — nothing at the
  // DB level stops a training program from citing a department that
  // actually belongs to a different college than the one it's filed under.
  if (department.collegeId !== input.collegeId) {
    throw new ValidationError('departmentId does not belong to the given collegeId');
  }

  if (input.academicYearId) {
    const academicYear = await organizationRepository.findAcademicYearById(input.academicYearId);
    if (!academicYear) {
      throw new NotFoundError('Academic year not found');
    }
    if (academicYear.collegeId !== input.collegeId) {
      throw new ValidationError('academicYearId does not belong to the given collegeId');
    }
  }

  return organizationRepository.createTrainingProgram({ ...input, createdBy });
}

async function updateTrainingProgram(
  id: string,
  input: UpdateTrainingProgramInput,
  updatedBy: string,
): Promise<TrainingProgram> {
  const existing = await organizationRepository.findTrainingProgramById(id);
  if (!existing) {
    throw new NotFoundError('Training program not found');
  }

  const updated = await organizationRepository.updateTrainingProgram(id, {
    ...input,
    updatedBy,
  });
  if (!updated) {
    throw new NotFoundError('Training program not found');
  }
  return updated;
}

async function deleteTrainingProgram(id: string): Promise<void> {
  const existing = await organizationRepository.findTrainingProgramById(id);
  if (!existing) {
    throw new NotFoundError('Training program not found');
  }
  await organizationRepository.deleteTrainingProgram(id);
}

// --- Training program trainers ---

async function listTrainingProgramTrainers(
  trainingProgramId: string,
  query: ListTrainingProgramTrainersQuery,
): Promise<ListTrainingProgramTrainersResult> {
  // 404s on a nonexistent program rather than silently returning an empty page.
  await findTrainingProgramById(trainingProgramId);

  const { items, total } = await organizationRepository.listTrainingProgramTrainers({
    trainingProgramId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function assignTrainingProgramTrainer(
  trainingProgramId: string,
  input: AssignTrainingProgramTrainerInput,
): Promise<TrainingProgramTrainer> {
  await findTrainingProgramById(trainingProgramId);

  // trainer_id references users(id) directly in schema.sql — there is no
  // separate `trainers` table at all, so "a valid trainer" just means "an
  // existing user." Whether that user actually holds a trainer-ish role is
  // the not-yet-built trainers module's concern, not this one — validating
  // only what's checkable now (usersService.findById throws NotFoundError
  // if the user doesn't exist), not blocking on that module existing.
  await usersService.findById(input.trainerId);

  const existingAssignment = await organizationRepository.findTrainingProgramTrainer(
    trainingProgramId,
    input.trainerId,
  );
  if (existingAssignment) {
    throw new ConflictError('This trainer is already assigned to this training program');
  }

  return organizationRepository.createTrainingProgramTrainer({
    trainingProgramId,
    trainerId: input.trainerId,
    roleInProgram: input.roleInProgram,
  });
}

async function removeTrainingProgramTrainer(
  trainingProgramId: string,
  trainerId: string,
): Promise<void> {
  await findTrainingProgramById(trainingProgramId);

  const removed = await organizationRepository.deleteTrainingProgramTrainer(
    trainingProgramId,
    trainerId,
  );
  if (!removed) {
    throw new NotFoundError('Trainer assignment not found');
  }
}

// --- Batches ---

async function listBatches(query: ListBatchesQuery): Promise<ListBatchesResult> {
  const { items, total } = await organizationRepository.listBatches({
    trainingProgramId: query.trainingProgramId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findBatchById(id: string): Promise<Batch> {
  const batch = await organizationRepository.findBatchById(id);
  if (!batch) {
    throw new NotFoundError('Batch not found');
  }
  return batch;
}

async function createBatch(input: CreateBatchInput, createdBy: string): Promise<Batch> {
  // batches has no academic_year_id column at all in schema.sql — only
  // training_program_id needs validating here.
  const trainingProgram = await organizationRepository.findTrainingProgramById(
    input.trainingProgramId,
  );
  if (!trainingProgram) {
    throw new NotFoundError('Training program not found');
  }

  return organizationRepository.createBatch({ ...input, createdBy });
}

async function updateBatch(
  id: string,
  input: UpdateBatchInput,
  updatedBy: string,
): Promise<Batch> {
  const existing = await organizationRepository.findBatchById(id);
  if (!existing) {
    throw new NotFoundError('Batch not found');
  }

  const updated = await organizationRepository.updateBatch(id, { ...input, updatedBy });
  if (!updated) {
    throw new NotFoundError('Batch not found');
  }
  return updated;
}

async function deleteBatch(id: string): Promise<void> {
  const existing = await organizationRepository.findBatchById(id);
  if (!existing) {
    throw new NotFoundError('Batch not found');
  }
  await organizationRepository.deleteBatch(id);
}

export const organizationService = {
  listColleges,
  findCollegeById,
  createCollege,
  updateCollege,
  deleteCollege,
  listDepartments,
  findDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listAcademicYears,
  findAcademicYearById,
  createAcademicYear,
  updateAcademicYear,
  listTrainingPrograms,
  findTrainingProgramById,
  createTrainingProgram,
  updateTrainingProgram,
  deleteTrainingProgram,
  listTrainingProgramTrainers,
  assignTrainingProgramTrainer,
  removeTrainingProgramTrainer,
  listBatches,
  findBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
};
