import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
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
  search?: string;
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
  mustChangePassword: studentProfiles.mustChangePassword,
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
  search?: string,
) {
  const conditions = [];
  if (collegeId) conditions.push(eq(studentProfiles.collegeId, collegeId));
  if (departmentId) conditions.push(eq(studentProfiles.departmentId, departmentId));
  if (!includeArchived) conditions.push(eq(studentProfiles.status, 'active'));
  // Matches the joined users.fullName or the student's own rollNumber — the
  // two fields an admin would realistically type into a search box. Both
  // callers below already LEFT JOIN users for the name-joined read shape, so
  // referencing users.fullName here doesn't need an extra join of its own —
  // except the two COUNT(*) queries, which previously didn't join users at
  // all (see listStudentProfiles' two branches below).
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(ilike(users.fullName, pattern), ilike(studentProfiles.rollNumber, pattern)));
  }
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
  const { collegeId, departmentId, batchId, includeArchived, search, page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  if (!batchId) {
    const conditions = buildDirectConditions(collegeId, departmentId, includeArchived, search);
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
      // Must LEFT JOIN users here too now: the `where` clause can reference
      // users.fullName (via the search condition above), and that column
      // isn't visible to this query's WHERE unless users is in its FROM/JOIN
      // list, even though this query never selects a users column itself.
      db
        .select({ count: sql<number>`count(*)` })
        .from(studentProfiles)
        .leftJoin(users, eq(users.id, studentProfiles.userId))
        .where(where),
    ]);
    return { items, total: Number(totalRows[0]?.count ?? 0) };
  }

  const conditions = [
    eq(trainingProgramStudents.batchId, batchId),
    ...buildDirectConditions(collegeId, departmentId, includeArchived, search),
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
    // Same reasoning as the no-batchId branch above: users must be joined
    // here too so `where`'s search condition on users.fullName resolves.
    db
      .select({ count: sql<number>`count(distinct ${studentProfiles.id})` })
      .from(studentProfiles)
      .innerJoin(trainingProgramStudents, eq(trainingProgramStudents.studentId, studentProfiles.id))
      .leftJoin(users, eq(users.id, studentProfiles.userId))
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

// --- Bulk student creation (Phase 3) ---

export interface CreateStudentWithEnrollmentData {
  profile: CreateStudentProfileData;
  trainingProgramId: string;
  batchId: string;
}

// One profile + one enrollment row, atomically: a student_profiles row with
// no matching training_program_students row (or vice versa) would be a
// silently half-created student — not just "row didn't get created," but a
// user account that logged in fine yet had no batch to attempt assessments
// against. This is the one piece of the whole bulk-creation flow that's
// genuinely atomic — see students.service.ts's createStudentsInBatch for
// why the surrounding user-account + role-assignment steps aren't wrapped
// into this same transaction (they're cross-module service calls against
// the shared `db` singleton, not this repository's own tx).
async function createStudentProfileWithEnrollment(
  data: CreateStudentWithEnrollmentData,
): Promise<StudentProfile> {
  return db.transaction(async (tx) => {
    const [studentProfile] = await tx.insert(studentProfiles).values(data.profile).returning();
    await tx.insert(trainingProgramStudents).values({
      trainingProgramId: data.trainingProgramId,
      studentId: studentProfile.id,
      batchId: data.batchId,
      createdBy: data.profile.createdBy ?? null,
    });
    return studentProfile;
  });
}

// --- CSV export (Phase 3) ---

export interface ExportStudentsParams {
  batchId: string;
  departmentId?: string;
  status?: 'active' | 'archived';
  limit?: number;
}

export interface StudentExportRow {
  fullName: string;
  email: string;
  rollNumber: string | null;
  departmentName: string | null;
  status: string;
}

// Unlike listStudentProfiles above, this selects users.email (the CSV needs
// it — see students.service.ts's exportStudentsCsv column spec) and is
// never paginated: "export" means every matching row (optionally capped by
// `limit`, the brief's own "first N" filter), not one page at a time.
// users is an INNER JOIN here, not LEFT: every student_profiles row has a
// NOT NULL, UNIQUE user_id, so this can never actually drop a row.
async function listStudentsForExport(params: ExportStudentsParams): Promise<StudentExportRow[]> {
  const { batchId, departmentId, status, limit } = params;
  const conditions = [eq(trainingProgramStudents.batchId, batchId)];
  if (departmentId) conditions.push(eq(studentProfiles.departmentId, departmentId));
  if (status) conditions.push(eq(studentProfiles.status, status));

  // Ordered by the joined users.fullName, not studentProfiles.createdAt —
  // Postgres requires every ORDER BY expression to appear in the SELECT
  // list for a SELECT DISTINCT (confirmed live: created_at isn't selected
  // here, and ordering by it threw "for SELECT DISTINCT, ORDER BY
  // expressions must appear in select list"). Ordering alphabetically by
  // name is also just a better default for a roster export, not merely a
  // workaround.
  const query = db
    .selectDistinct({
      fullName: users.fullName,
      email: users.email,
      rollNumber: studentProfiles.rollNumber,
      departmentName: departments.name,
      status: studentProfiles.status,
    })
    .from(studentProfiles)
    .innerJoin(trainingProgramStudents, eq(trainingProgramStudents.studentId, studentProfiles.id))
    .innerJoin(users, eq(users.id, studentProfiles.userId))
    .leftJoin(departments, eq(departments.id, studentProfiles.departmentId))
    .where(and(...conditions))
    .orderBy(asc(users.fullName));

  return limit ? query.limit(limit) : query;
}

export const studentsRepository = {
  listStudentProfiles,
  findStudentProfileById,
  findStudentProfileByUserId,
  listActiveBatchIdsForStudent,
  createStudentProfile,
  updateStudentProfile,
  archiveStudentProfile,
  createStudentProfileWithEnrollment,
  listStudentsForExport,
};
