import type { StudentProfile } from '../../db/types';
import { organizationService } from '../organization/organization.service';
import { usersService } from '../users/users.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { studentsRepository } from './students.repository';
import type {
  CreateStudentProfileInput,
  CreateStudentsInBatchInput,
  ExportBatchStudentsQuery,
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
    search: query.search,
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

// --- Bulk student creation (Phase 3) ---

export interface CreateStudentsInBatchResult {
  created: Array<{ studentProfileId: string; userId: string; email: string; fullName: string }>;
}

// Single-student manual entry reuses this exact function with a one-item
// `input.students` array — no separate function/route, per the brief's own
// "same endpoint, friendlier single-row UI" instruction (see
// students.schema.ts's createStudentsInBatchSchema comment).
async function createStudentsInBatch(
  batchId: string,
  input: CreateStudentsInBatchInput,
  activeCollegeId: string | null,
  createdBy: string,
): Promise<CreateStudentsInBatchResult> {
  // CRITICAL access rule, stated rather than silently allowed: Faculty is
  // rejected unconditionally here, not just college-scoped. Per-trainer
  // batch assignment (Phase 4) doesn't exist yet, so there's no data
  // anywhere saying WHICH batches a given Faculty member should be able to
  // add students to — even within their own college. A college-match check
  // alone (like analytics.service.ts's assertCanAccessBatch) would let ANY
  // Faculty member at a college add students to ANY batch there, which is
  // broader access than intended once Phase 4 actually scopes this per
  // trainer. This route is also gated by 'students.manage' at the route
  // layer (super_admin only — see students.routes.ts and
  // 0005_add-students-permissions.sql's grant), so Faculty never reaches
  // this check in practice today; it's here as defense-in-depth against a
  // future permission grant that doesn't also update this logic, and as the
  // one line Phase 4 needs to replace with real assigned-batch scoping.
  if (activeCollegeId !== null) {
    throw new ForbiddenError(
      'Only Super Admin can add students to a batch until per-trainer batch assignment exists',
    );
  }

  const batch = await organizationService.findBatchById(batchId);
  const trainingProgram = await organizationService.findTrainingProgramById(batch.trainingProgramId);

  // Every student in a batch shares this one initial password — see
  // organization.service.ts's createBatch (Phase 2), which hashes it with
  // argon2 at batch-creation time. Copied verbatim into each new user's own
  // password_hash below; no fresh argon2.hash() call needed here, and
  // auth.service.ts's login (argon2.verify) needs no changes at all — a
  // student created this way is indistinguishable from any other user at
  // login time, which is the whole point of reusing the same hash.
  if (!batch.commonPasswordHash) {
    throw new ConflictError('This batch has no common password set — cannot provision student logins');
  }

  const normalizedEmails = input.students.map((row) => row.email.trim().toLowerCase());
  const seen = new Set<string>();
  const duplicatesInRequest = new Set<string>();
  for (const email of normalizedEmails) {
    if (seen.has(email)) duplicatesInRequest.add(email);
    seen.add(email);
  }
  if (duplicatesInRequest.size > 0) {
    throw new ValidationError(`Duplicate emails in this submission: ${[...duplicatesInRequest].join(', ')}`);
  }

  const existingUsers = await Promise.all(
    normalizedEmails.map((email) => usersService.findByEmail(email)),
  );
  const alreadyRegistered = input.students
    .filter((_, index) => existingUsers[index] !== undefined)
    .map((row) => row.email);
  if (alreadyRegistered.length > 0) {
    throw new ConflictError(`These emails are already registered: ${alreadyRegistered.join(', ')}`);
  }

  const studentRole = await usersService.findRoleBySlug('student');

  // NOT wrapped in one cross-module database transaction: usersService's
  // createUser/assignRole and studentsRepository's own
  // createStudentProfileWithEnrollment all run against the shared `db`
  // singleton independently, and none of this codebase's services accept
  // an injectable transaction client today — threading one through three
  // modules' service layers is a bigger refactor than this phase's stated
  // scope. Practical effect: full pre-validation above (duplicate/already-
  // registered checks) makes a mid-loop failure unlikely, but if row N of a
  // bulk submission does fail, rows before it stay created (a real,
  // stated limitation, not a silently-assumed one) — students.repository.ts's
  // createStudentProfileWithEnrollment at least keeps EACH row's own
  // profile+enrollment pair atomic with each other.
  const created: CreateStudentsInBatchResult['created'] = [];
  for (const row of input.students) {
    const user = await usersService.createUser(
      { email: row.email, passwordHash: batch.commonPasswordHash, fullName: row.fullName },
      createdBy,
    );

    await usersService.assignRole(
      user.id,
      { roleId: studentRole.id, collegeId: trainingProgram.collegeId },
      createdBy,
    );

    const studentProfile = await studentsRepository.createStudentProfileWithEnrollment({
      profile: {
        userId: user.id,
        collegeId: trainingProgram.collegeId,
        departmentId: row.departmentId ?? trainingProgram.departmentId ?? null,
        rollNumber: row.rollNumber ?? null,
        createdBy,
      },
      trainingProgramId: batch.trainingProgramId,
      batchId: batch.id,
    });

    created.push({
      studentProfileId: studentProfile.id,
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
    });
  }

  return { created };
}

// --- CSV export (Phase 3) ---

function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Columns per the brief's own spec: full_name, email, reg_no, department,
// status. Deliberately NO "Handled by: <trainer names>" trailing row — the
// brief's spec includes one, but batch_trainers doesn't exist yet (Phase
// 4). A placeholder like "Handled by: (not yet assigned)" would be
// identical on every single export until that phase ships, which is worse
// than just not printing it: it implies a real, checked concept ("this
// batch's assignment status") when there's no assignment concept at all
// yet, for anyone. Omitting the row entirely is the honest choice — Phase 4
// adds it as a genuinely new capability, not a placeholder graduating into
// real data.
function toCsv(rows: { fullName: string; email: string; rollNumber: string | null; departmentName: string | null; status: string }[]): string {
  const header = ['full_name', 'email', 'reg_no', 'department', 'status'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [row.fullName, row.email, row.rollNumber ?? '', row.departmentName ?? '', row.status]
        .map(escapeCsvField)
        .join(','),
    );
  }
  return lines.join('\n');
}

// Gated by 'students.view' at the route layer (both Super Admin and
// Faculty hold it — see 0016_grant-faculty-students-view.sql), not the
// stricter 'students.manage' createStudentsInBatch above uses: exporting a
// roster is read-only, and a Faculty member exporting a batch already
// within THEIR OWN college's scope is consistent with what students.view
// already permits elsewhere (students.repository.ts's own college-scoped
// list). The "faculty effectively rejected" rule above is specific to
// *creating* accounts, not reading an existing roster.
async function exportStudentsCsv(
  batchId: string,
  query: ExportBatchStudentsQuery,
  activeCollegeId: string | null,
): Promise<string> {
  const batch = await organizationService.findBatchById(batchId);
  const trainingProgram = await organizationService.findTrainingProgramById(batch.trainingProgramId);

  if (activeCollegeId !== null && trainingProgram.collegeId !== activeCollegeId) {
    throw new ForbiddenError('You are not authorized to export students for this batch');
  }

  const rows = await studentsRepository.listStudentsForExport({
    batchId,
    departmentId: query.departmentId,
    status: query.status,
    limit: query.limit,
  });

  return toCsv(rows);
}

export const studentsService = {
  listStudentProfiles,
  findStudentProfileById,
  findStudentProfileByUserId,
  listActiveBatchIdsForStudent,
  createStudentProfile,
  updateStudentProfile,
  archiveStudentProfile,
  createStudentsInBatch,
  exportStudentsCsv,
};
