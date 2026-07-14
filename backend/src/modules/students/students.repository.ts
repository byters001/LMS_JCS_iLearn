import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { users } from '../../db/schema/identity.schema';
import { colleges, departments } from '../../db/schema/organization.schema';
import { studentProfiles, trainingProgramStudents } from '../../db/schema/students.schema';
import type { StudentProfile } from '../../db/types';

// Archive, not soft-delete-via-column and not hard delete: student_profiles
// has no deleted_at column, but unlike trainer_profiles it DOES have an
// explicit status enum (active/archived) plus archived_at/access_revoked_at
// timestamps — schema.sql's own designed mechanism for "this student is no
// longer active" without removing the row. Reinforced by
// training_program_students.student_id being ON DELETE RESTRICT: a hard
// DELETE of any student with enrollment history would be rejected by
// Postgres anyway. "archiveStudentProfile" below sets status + archivedAt
// rather than issuing a DELETE.

export interface ListStudentProfilesParams {
  collegeId?: string;
  departmentId?: string;
  batchId?: string;
  includeArchived?: boolean;
  page: number;
  pageSize: number;
}

// Name-joined read shape for listStudentProfiles — mirrors
// analytics.repository.ts's listBatchAttemptsForAssessment pattern (an
// explicit named-column select alongside the join, not a bare
// db.select().from(...)), the closest existing precedent for "resolve a
// human-readable name via a join" in this codebase, reused here rather than
// inventing a different shape. All three joins are LEFT JOINs, including
// users/colleges (whose FKs are NOT NULL and would never actually produce a
// missing match) — deliberately so a hypothetical orphaned row is never
// silently dropped from the list, just returned with a null name; the type
// below reflects that honestly instead of asserting non-null on a LEFT JOIN
// result. departmentId is a genuinely optional FK (student_profiles.
// department_id has no NOT NULL), so departmentName is null there for a
// real, expected reason (no department set), not just join defensiveness.
export interface StudentProfileWithNames extends StudentProfile {
  fullName: string | null;
  departmentName: string | null;
  collegeName: string | null;
}

const STUDENT_PROFILE_WITH_NAMES_COLUMNS = {
  id: studentProfiles.id,
  userId: studentProfiles.userId,
  collegeId: studentProfiles.collegeId,
  departmentId: studentProfiles.departmentId,
  rollNumber: studentProfiles.rollNumber,
  photoUrl: studentProfiles.photoUrl,
  contactEmailAlt: studentProfiles.contactEmailAlt,
  contactPhone: studentProfiles.contactPhone,
  status: studentProfiles.status,
  archivedAt: studentProfiles.archivedAt,
  accessRevokedAt: studentProfiles.accessRevokedAt,
  createdAt: studentProfiles.createdAt,
  updatedAt: studentProfiles.updatedAt,
  createdBy: studentProfiles.createdBy,
  updatedBy: studentProfiles.updatedBy,
  fullName: users.fullName,
  departmentName: departments.name,
  collegeName: colleges.name,
} as const;

export interface ListStudentProfilesResult {
  items: StudentProfileWithNames[];
  total: number;
}

// Excludes status = 'archived' by default — same convention every other
// soft-delete-equivalent entity in this codebase follows (colleges,
// departments, users, all via deletedAt IS NULL). student_profiles has no
// deletedAt; status/archivedAt is its equivalent mechanism (see the module
// comment above), so the default list should exclude archived rows the
// same way. includeArchived opts back in.
function buildDirectConditions(
  collegeId?: string,
  departmentId?: string,
  includeArchived?: boolean,
) {
  const conditions = [];
  if (collegeId) conditions.push(eq(studentProfiles.collegeId, collegeId));
  if (departmentId) conditions.push(eq(studentProfiles.departmentId, departmentId));
  if (!includeArchived) conditions.push(eq(studentProfiles.status, 'active'));
  return conditions;
}

// collegeId/departmentId are direct columns on student_profiles (unlike
// trainer_profiles, which had neither) — a plain WHERE, no join needed.
// batchId is NOT a student_profiles column; it lives on
// training_program_students, so that filter alone requires a join.
// DISTINCT on the joined path guards against a student having more than
// one matching enrollment row.
async function listStudentProfiles(
  params: ListStudentProfilesParams,
): Promise<ListStudentProfilesResult> {
  const { collegeId, departmentId, batchId, includeArchived, page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  if (!batchId) {
    const conditions = buildDirectConditions(collegeId, departmentId, includeArchived);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, totalRows] = await Promise.all([
      db
        .select(STUDENT_PROFILE_WITH_NAMES_COLUMNS)
        .from(studentProfiles)
        .leftJoin(users, eq(users.id, studentProfiles.userId))
        .leftJoin(departments, eq(departments.id, studentProfiles.departmentId))
        .leftJoin(colleges, eq(colleges.id, studentProfiles.collegeId))
        .where(where)
        .orderBy(asc(studentProfiles.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(studentProfiles).where(where),
    ]);
    return { items, total: Number(totalRows[0]?.count ?? 0) };
  }

  const conditions = [
    eq(trainingProgramStudents.batchId, batchId),
    ...buildDirectConditions(collegeId, departmentId, includeArchived),
  ];
  const where = and(...conditions);

  // selectDistinct on the flat named-column shape directly — no need for
  // the nested-then-unwrapped `{ studentProfile: studentProfiles }` shape
  // the pre-name-join version used, now that the select is already an
  // explicit column list. DISTINCT still only bites on the same thing it
  // did before (collapsing duplicate rows from a student with more than one
  // matching training_program_students row) — fullName/departmentName/
  // collegeName are functionally dependent on studentProfiles' own id, so
  // joining them in adds no new source of duplication.
  const [items, totalRows] = await Promise.all([
    db
      .selectDistinct(STUDENT_PROFILE_WITH_NAMES_COLUMNS)
      .from(studentProfiles)
      .innerJoin(trainingProgramStudents, eq(trainingProgramStudents.studentId, studentProfiles.id))
      .leftJoin(users, eq(users.id, studentProfiles.userId))
      .leftJoin(departments, eq(departments.id, studentProfiles.departmentId))
      .leftJoin(colleges, eq(colleges.id, studentProfiles.collegeId))
      .where(where)
      .orderBy(asc(studentProfiles.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(distinct ${studentProfiles.id})` })
      .from(studentProfiles)
      .innerJoin(trainingProgramStudents, eq(trainingProgramStudents.studentId, studentProfiles.id))
      .where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findStudentProfileById(id: string): Promise<StudentProfile | undefined> {
  const [studentProfile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.id, id))
    .limit(1);
  return studentProfile;
}

// Used for the pre-insert uniqueness check (student_profiles.user_id is
// UNIQUE in schema.sql — one profile per user).
async function findStudentProfileByUserId(userId: string): Promise<StudentProfile | undefined> {
  const [studentProfile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  return studentProfile;
}

// Added for the attempts module (Part 1 fix) — student_profiles has no
// batch_id column of its own (confirmed directly against schema.sql); a
// student's batch membership only exists via training_program_students
// (student_id -> student_profiles.id, batch_id -> batches.id), the same
// join listStudentProfiles' own batchId filter above already uses.
// Filtered to status = 'active' — tps_status_enum also has 'transferred',
// 'repeated', 'completed', 'dropped', none of which should still count as
// "currently in this batch" for authorization purposes (a dropped or
// transferred enrollment shouldn't keep authorizing access to that batch's
// assessments). A student can legitimately have more than one active row
// (rare, but nothing in schema.sql prevents it), so this returns all
// matching batch ids, not just one.
async function listActiveBatchIdsForStudent(studentId: string): Promise<string[]> {
  const rows = await db
    .select({ batchId: trainingProgramStudents.batchId })
    .from(trainingProgramStudents)
    .where(
      and(
        eq(trainingProgramStudents.studentId, studentId),
        eq(trainingProgramStudents.status, 'active'),
      ),
    );
  return rows.map((row) => row.batchId);
}

export interface CreateStudentProfileData {
  userId: string;
  collegeId: string;
  departmentId?: string | null;
  rollNumber?: string | null;
  photoUrl?: string | null;
  contactEmailAlt?: string | null;
  contactPhone?: string | null;
  createdBy: string | null;
}

async function createStudentProfile(data: CreateStudentProfileData): Promise<StudentProfile> {
  const [studentProfile] = await db.insert(studentProfiles).values(data).returning();
  return studentProfile;
}

// userId/collegeId/departmentId are deliberately not part of the update
// surface — same structural-anchor reasoning as everywhere else in this
// codebase. A department transfer is a deliberate action, not a casual
// profile edit; not exposed in this phase.
export interface UpdateStudentProfileData {
  rollNumber?: string | null;
  photoUrl?: string | null;
  contactEmailAlt?: string | null;
  contactPhone?: string | null;
  status?: 'active' | 'archived';
  updatedBy?: string | null;
}

async function updateStudentProfile(
  id: string,
  data: UpdateStudentProfileData,
): Promise<StudentProfile | undefined> {
  const [updated] = await db
    .update(studentProfiles)
    .set(data)
    .where(eq(studentProfiles.id, id))
    .returning();
  return updated;
}

async function archiveStudentProfile(id: string, updatedBy: string | null): Promise<boolean> {
  const [archived] = await db
    .update(studentProfiles)
    .set({ status: 'archived', archivedAt: new Date(), updatedBy })
    .where(and(eq(studentProfiles.id, id), eq(studentProfiles.status, 'active')))
    .returning({ id: studentProfiles.id });
  return Boolean(archived);
}

export const studentsRepository = {
  listStudentProfiles,
  findStudentProfileById,
  findStudentProfileByUserId,
  listActiveBatchIdsForStudent,
  createStudentProfile,
  updateStudentProfile,
  archiveStudentProfile,
};
