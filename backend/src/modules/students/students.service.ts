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

// Added for the attempts module (Part 1) — the first cross-module caller
// that needs "which student_profiles row belongs to this JWT user id,"
// since request.user only carries the users.id, but assessment_attempts.
// student_id references student_profiles(id). Same small, additive
// precedent as trainersService.findTrainingSessionById in
// assessments.service.ts: the repository lookup (findStudentProfileByUserId)
// already existed for an internal uniqueness check; this just exposes it
// through the service so another module can call it without reaching into
// students.repository.ts directly (CLAUDE.md's boundary rule). Returns
// undefined rather than throwing — a caller with no student_profiles row
// (e.g. staff) is a normal, expected case for this lookup, not an error.
async function findStudentProfileByUserId(userId: string): Promise<StudentProfile | undefined> {
  return studentsRepository.findStudentProfileByUserId(userId);
}

// Added for the attempts module (Part 1 fix) — startAttempt needs "which
// batches is this student currently, actively enrolled in" to check
// against assessment_batches before authorizing an attempt. Pure
// passthrough to the repository (no business logic to add — see
// students.repository.ts's listActiveBatchIdsForStudent for the FK path
// and the 'active'-only filtering reasoning), same trivial-wrapper shape
// as assessments.service.ts's own listAssessmentBatches.
async function listActiveBatchIdsForStudent(studentProfileId: string): Promise<string[]> {
  return studentsRepository.listActiveBatchIdsForStudent(studentProfileId);
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
  findStudentProfileByUserId,
  listActiveBatchIdsForStudent,
  createStudentProfile,
  updateStudentProfile,
  archiveStudentProfile,
};
