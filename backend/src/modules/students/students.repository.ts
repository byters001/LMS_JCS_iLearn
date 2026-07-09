import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
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

export interface ListStudentProfilesResult {
  items: StudentProfile[];
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
        .select()
        .from(studentProfiles)
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

  const [items, totalRows] = await Promise.all([
    db
      .selectDistinct({ studentProfile: studentProfiles })
      .from(studentProfiles)
      .innerJoin(trainingProgramStudents, eq(trainingProgramStudents.studentId, studentProfiles.id))
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

  return {
    items: items.map((row) => row.studentProfile),
    total: Number(totalRows[0]?.count ?? 0),
  };
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
  createStudentProfile,
  updateStudentProfile,
  archiveStudentProfile,
};
