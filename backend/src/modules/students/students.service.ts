import type { StudentProfile } from '../../db/types';
import { organizationService } from '../organization/organization.service';
import { usersService } from '../users/users.service';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { studentsRepository } from './students.repository';
import type {
  CreateStudentProfileInput,
  ListStudentProfilesQuery,
  UpdateStudentProfileInput,
} from './students.schema';
import type { ListStudentProfilesResult } from './students.types';

async function listStudentProfiles(
  query: ListStudentProfilesQuery,
): Promise<ListStudentProfilesResult> {
  const { items, total } = await studentsRepository.listStudentProfiles({
    collegeId: query.collegeId,
    departmentId: query.departmentId,
    batchId: query.batchId,
    includeArchived: query.includeArchived,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findStudentProfileById(id: string): Promise<StudentProfile> {
  const studentProfile = await studentsRepository.findStudentProfileById(id);
  if (!studentProfile) {
    throw new NotFoundError('Student profile not found');
  }
  return studentProfile;
}

async function createStudentProfile(
  input: CreateStudentProfileInput,
  createdBy: string,
): Promise<StudentProfile> {
  // student_profiles.user_id is NOT NULL UNIQUE REFERENCES users(id) in
  // schema.sql — same requirement as trainer_profiles: a student profile
  // requires an existing user account. This module doesn't create users
  // itself, same reasoning as trainers (no module in this codebase exposes
  // user creation at all yet). Throws NotFoundError (an AppError) if
  // input.userId doesn't exist.
  await usersService.findById(input.userId);

  // Unlike trainer_profiles, student_profiles.college_id is NOT NULL — a
  // student profile requires an existing, non-deleted college. Cross-module
  // service call (organizationService), per the established boundary rule.
  const college = await organizationService.findCollegeById(input.collegeId);

  if (input.departmentId) {
    const department = await organizationService.findDepartmentById(input.departmentId);
    // Same cross-entity consistency check as training_programs in the
    // organization module: college_id and department_id are independent FK
    // columns, nothing at the DB level ties them together.
    if (department.collegeId !== college.id) {
      throw new ValidationError('departmentId does not belong to the given collegeId');
    }
  }

  // Pre-check for the UNIQUE(user_id) constraint.
  const existingProfile = await studentsRepository.findStudentProfileByUserId(input.userId);
  if (existingProfile) {
    throw new ConflictError('This user already has a student profile');
  }

  return studentsRepository.createStudentProfile({ ...input, createdBy });
}

async function updateStudentProfile(
  id: string,
  input: UpdateStudentProfileInput,
  updatedBy: string,
): Promise<StudentProfile> {
  const existing = await studentsRepository.findStudentProfileById(id);
  if (!existing) {
    throw new NotFoundError('Student profile not found');
  }

  const updated = await studentsRepository.updateStudentProfile(id, { ...input, updatedBy });
  if (!updated) {
    throw new NotFoundError('Student profile not found');
  }
  return updated;
}

// "Delete" for student_profiles is archiving (status='archived' +
// archivedAt), not a physical DELETE — see students.repository.ts's
// comment for the full reasoning (no deleted_at column, but an explicit
// status/archived_at lifecycle exists, and training_program_students.
// student_id is ON DELETE RESTRICT anyway).
async function archiveStudentProfile(id: string, updatedBy: string): Promise<void> {
  const existing = await studentsRepository.findStudentProfileById(id);
  if (!existing) {
    throw new NotFoundError('Student profile not found');
  }
  if (existing.status === 'archived') {
    throw new ConflictError('Student profile is already archived');
  }

  await studentsRepository.archiveStudentProfile(id, updatedBy);
}

export const studentsService = {
  listStudentProfiles,
  findStudentProfileById,
  createStudentProfile,
  updateStudentProfile,
  archiveStudentProfile,
};
