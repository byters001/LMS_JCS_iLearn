import type { AcademicYear, College, Department } from '../../db/types';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error';
import { organizationRepository } from './organization.repository';
import type {
  CreateAcademicYearInput,
  CreateCollegeInput,
  CreateDepartmentInput,
  ListAcademicYearsQuery,
  ListCollegesQuery,
  ListDepartmentsQuery,
  UpdateAcademicYearInput,
  UpdateCollegeInput,
  UpdateDepartmentInput,
} from './organization.schema';
import type {
  ListAcademicYearsResult,
  ListCollegesResult,
  ListDepartmentsResult,
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
};
