import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { users } from '../../db/schema/identity.schema';
import {
  academicYears,
  batches,
  batchTrainers,
  colleges,
  departments,
  trainingProgramTrainers,
  trainingPrograms,
} from '../../db/schema/organization.schema';
// trainingProgramStudents/studentProfiles live in students.schema.ts, not
// this module's own schema file — imported directly for plain SQL
// joins/updates (student count per batch; the Phase 4 deactivation
// cascade), same as students.repository.ts already imports users/
// departments/colleges directly for its own name-joins. CLAUDE.md's
// boundary rule is about not calling another module's SERVICE/REPOSITORY
// functions, not about sharing a raw table definition for a join or a
// write that must share ONE transaction — see deactivateBatchCascade
// below for why this one specific function writes to `users` directly
// rather than going through usersService (no service in this codebase
// accepts an injectable transaction client today, and the whole point of
// this function is that the batch-status change and the affected
// students' account deactivation commit atomically or not at all).
import { studentProfiles, trainingProgramStudents } from '../../db/schema/students.schema';
import type {
  AcademicYear,
  Batch,
  BatchTrainer,
  College,
  Department,
  TrainingProgram,
  TrainingProgramTrainer,
} from '../../db/types';

// --- Colleges ---
// Soft delete (deleted_at): schema.sql gives colleges a deleted_at column,
// and departments/academic_years both have ON DELETE RESTRICT foreign keys
// pointing at colleges(id) — a hard DELETE would be rejected by Postgres the
// moment any department or academic year still references the college
// anyway. Soft delete is really the only sane option here, not just the
// conventional one. Distinct from `status` (active/expired/archived): status
// is a business-lifecycle field, freely settable via updateCollege; deleted_at
// means "remove from view entirely," a separate concern.

export interface ListCollegesParams {
  page: number;
  pageSize: number;
}

export interface ListCollegesResult {
  items: College[];
  total: number;
}

async function listColleges(params: ListCollegesParams): Promise<ListCollegesResult> {
  const { page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = isNull(colleges.deletedAt);

  const [items, totalRows] = await Promise.all([
    db.select().from(colleges).where(where).orderBy(asc(colleges.name)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(colleges).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findCollegeById(id: string): Promise<College | undefined> {
  const [college] = await db
    .select()
    .from(colleges)
    .where(and(eq(colleges.id, id), isNull(colleges.deletedAt)))
    .limit(1);
  return college;
}

// Deliberately not deletedAt-filtered: colleges.code has a plain (non-partial)
// UNIQUE constraint in schema.sql, so it's unique across every row including
// soft-deleted ones. A pre-insert uniqueness check needs to see the same
// rows Postgres's constraint would, or it'd wrongly allow a code that's
// still held by an archived/soft-deleted college.
async function findCollegeByCode(code: string): Promise<College | undefined> {
  const [college] = await db.select().from(colleges).where(eq(colleges.code, code)).limit(1);
  return college;
}

export interface CreateCollegeData {
  name: string;
  code: string;
  logoUrl?: string | null;
  address?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  createdBy: string | null;
}

async function createCollege(data: CreateCollegeData): Promise<College> {
  const [college] = await db.insert(colleges).values(data).returning();
  return college;
}

export interface UpdateCollegeData {
  name?: string;
  code?: string;
  logoUrl?: string | null;
  address?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  status?: 'active' | 'expired' | 'archived';
  updatedBy?: string | null;
}

async function updateCollege(id: string, data: UpdateCollegeData): Promise<College | undefined> {
  const [updated] = await db
    .update(colleges)
    .set(data)
    .where(and(eq(colleges.id, id), isNull(colleges.deletedAt)))
    .returning();
  return updated;
}

async function deleteCollege(id: string): Promise<boolean> {
  const [deleted] = await db
    .update(colleges)
    .set({ deletedAt: new Date() })
    .where(and(eq(colleges.id, id), isNull(colleges.deletedAt)))
    .returning({ id: colleges.id });
  return Boolean(deleted);
}

// --- Departments ---
// Soft delete (deleted_at): same reasoning as colleges — schema.sql gives
// departments a deleted_at column, so that's the intended mechanism.

export interface ListDepartmentsParams {
  collegeId?: string;
  page: number;
  pageSize: number;
}

export interface ListDepartmentsResult {
  items: Department[];
  total: number;
}

function buildDepartmentsWhere(collegeId?: string) {
  const conditions = [isNull(departments.deletedAt)];
  if (collegeId) conditions.push(eq(departments.collegeId, collegeId));
  return and(...conditions);
}

async function listDepartments(params: ListDepartmentsParams): Promise<ListDepartmentsResult> {
  const { collegeId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = buildDepartmentsWhere(collegeId);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(departments)
      .where(where)
      .orderBy(asc(departments.name))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(departments).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findDepartmentById(id: string): Promise<Department | undefined> {
  const [department] = await db
    .select()
    .from(departments)
    .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
    .limit(1);
  return department;
}

export interface CreateDepartmentData {
  collegeId: string;
  name: string;
  code?: string | null;
  createdBy: string | null;
}

async function createDepartment(data: CreateDepartmentData): Promise<Department> {
  const [department] = await db.insert(departments).values(data).returning();
  return department;
}

// collegeId is deliberately not part of the update surface — moving a
// department to a different college is a structural change, not a profile
// edit, and organization.service.ts doesn't offer a way to do it here.
export interface UpdateDepartmentData {
  name?: string;
  code?: string | null;
  updatedBy?: string | null;
}

async function updateDepartment(
  id: string,
  data: UpdateDepartmentData,
): Promise<Department | undefined> {
  const [updated] = await db
    .update(departments)
    .set(data)
    .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
    .returning();
  return updated;
}

async function deleteDepartment(id: string): Promise<boolean> {
  const [deleted] = await db
    .update(departments)
    .set({ deletedAt: new Date() })
    .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
    .returning({ id: departments.id });
  return Boolean(deleted);
}

// --- Academic years ---
// No delete function: schema.sql gives academic_years no deleted_at column
// (unlike colleges/departments), so soft delete isn't representable without
// inventing a column that isn't in the reference schema. The only other
// option would be a hard DELETE, which wasn't asked for and is a bigger,
// more destructive decision than this phase should make speculatively — see
// organization.service.ts / the task response for the full reasoning.

export interface ListAcademicYearsParams {
  collegeId?: string;
  page: number;
  pageSize: number;
}

export interface ListAcademicYearsResult {
  items: AcademicYear[];
  total: number;
}

function buildAcademicYearsWhere(collegeId?: string) {
  return collegeId ? eq(academicYears.collegeId, collegeId) : undefined;
}

async function listAcademicYears(
  params: ListAcademicYearsParams,
): Promise<ListAcademicYearsResult> {
  const { collegeId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = buildAcademicYearsWhere(collegeId);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(academicYears)
      .where(where)
      .orderBy(asc(academicYears.yearLabel))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(academicYears).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findAcademicYearById(id: string): Promise<AcademicYear | undefined> {
  const [academicYear] = await db
    .select()
    .from(academicYears)
    .where(eq(academicYears.id, id))
    .limit(1);
  return academicYear;
}

export interface CreateAcademicYearData {
  collegeId: string;
  yearLabel: string;
  startDate?: string | null;
  endDate?: string | null;
  createdBy: string | null;
}

async function createAcademicYear(data: CreateAcademicYearData): Promise<AcademicYear> {
  const [academicYear] = await db.insert(academicYears).values(data).returning();
  return academicYear;
}

export interface UpdateAcademicYearData {
  yearLabel?: string;
  startDate?: string | null;
  endDate?: string | null;
  updatedBy?: string | null;
}

async function updateAcademicYear(
  id: string,
  data: UpdateAcademicYearData,
): Promise<AcademicYear | undefined> {
  const [updated] = await db
    .update(academicYears)
    .set(data)
    .where(eq(academicYears.id, id))
    .returning();
  return updated;
}

// --- Training programs ---
// Soft delete (deleted_at): schema.sql gives training_programs a deleted_at
// column, same mechanism as colleges/departments.

export interface ListTrainingProgramsParams {
  collegeId?: string;
  departmentId?: string;
  page: number;
  pageSize: number;
}

export interface ListTrainingProgramsResult {
  items: TrainingProgram[];
  total: number;
}

function buildTrainingProgramsWhere(collegeId?: string, departmentId?: string) {
  const conditions = [isNull(trainingPrograms.deletedAt)];
  if (collegeId) conditions.push(eq(trainingPrograms.collegeId, collegeId));
  if (departmentId) conditions.push(eq(trainingPrograms.departmentId, departmentId));
  return and(...conditions);
}

async function listTrainingPrograms(
  params: ListTrainingProgramsParams,
): Promise<ListTrainingProgramsResult> {
  const { collegeId, departmentId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = buildTrainingProgramsWhere(collegeId, departmentId);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(trainingPrograms)
      .where(where)
      .orderBy(asc(trainingPrograms.name))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(trainingPrograms).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findTrainingProgramById(id: string): Promise<TrainingProgram | undefined> {
  const [trainingProgram] = await db
    .select()
    .from(trainingPrograms)
    .where(and(eq(trainingPrograms.id, id), isNull(trainingPrograms.deletedAt)))
    .limit(1);
  return trainingProgram;
}

export interface CreateTrainingProgramData {
  collegeId: string;
  departmentId: string;
  academicYearId?: string | null;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdBy: string | null;
}

async function createTrainingProgram(data: CreateTrainingProgramData): Promise<TrainingProgram> {
  const [trainingProgram] = await db.insert(trainingPrograms).values(data).returning();
  return trainingProgram;
}

// collegeId/departmentId/academicYearId are deliberately not part of the
// update surface — same reasoning as departments/academic_years: these are
// structural anchors set at creation, not profile fields you'd casually edit.
export interface UpdateTrainingProgramData {
  name?: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: 'planned' | 'ongoing' | 'completed' | 'archived';
  updatedBy?: string | null;
}

async function updateTrainingProgram(
  id: string,
  data: UpdateTrainingProgramData,
): Promise<TrainingProgram | undefined> {
  const [updated] = await db
    .update(trainingPrograms)
    .set(data)
    .where(and(eq(trainingPrograms.id, id), isNull(trainingPrograms.deletedAt)))
    .returning();
  return updated;
}

async function deleteTrainingProgram(id: string): Promise<boolean> {
  const [deleted] = await db
    .update(trainingPrograms)
    .set({ deletedAt: new Date() })
    .where(and(eq(trainingPrograms.id, id), isNull(trainingPrograms.deletedAt)))
    .returning({ id: trainingPrograms.id });
  return Boolean(deleted);
}

// --- Training program trainers ---
// Hard delete, no deleted_at column: schema.sql doesn't give this join
// table a soft-delete column, same situation as user_roles in the users
// module (see that repository's revokeRole comment) — this is pure
// join/assignment membership (which trainers are staffed on which
// program), not an audit-worthy entity of its own.

export interface ListTrainingProgramTrainersParams {
  trainingProgramId?: string;
  page: number;
  pageSize: number;
}

export interface ListTrainingProgramTrainersResult {
  items: TrainingProgramTrainer[];
  total: number;
}

async function listTrainingProgramTrainers(
  params: ListTrainingProgramTrainersParams,
): Promise<ListTrainingProgramTrainersResult> {
  const { trainingProgramId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = trainingProgramId
    ? eq(trainingProgramTrainers.trainingProgramId, trainingProgramId)
    : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(trainingProgramTrainers)
      .where(where)
      .orderBy(asc(trainingProgramTrainers.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(trainingProgramTrainers).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

// Used both for the pre-insert duplicate check (UNIQUE(training_program_id,
// trainer_id) in schema.sql) and to confirm an assignment exists before
// deleting it.
async function findTrainingProgramTrainer(
  trainingProgramId: string,
  trainerId: string,
): Promise<TrainingProgramTrainer | undefined> {
  const [assignment] = await db
    .select()
    .from(trainingProgramTrainers)
    .where(
      and(
        eq(trainingProgramTrainers.trainingProgramId, trainingProgramId),
        eq(trainingProgramTrainers.trainerId, trainerId),
      ),
    )
    .limit(1);
  return assignment;
}

export interface AssignTrainingProgramTrainerData {
  trainingProgramId: string;
  trainerId: string;
  roleInProgram?: 'lead' | 'co_trainer';
}

async function createTrainingProgramTrainer(
  data: AssignTrainingProgramTrainerData,
): Promise<TrainingProgramTrainer> {
  const [assignment] = await db.insert(trainingProgramTrainers).values(data).returning();
  return assignment;
}

async function deleteTrainingProgramTrainer(
  trainingProgramId: string,
  trainerId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(trainingProgramTrainers)
    .where(
      and(
        eq(trainingProgramTrainers.trainingProgramId, trainingProgramId),
        eq(trainingProgramTrainers.trainerId, trainerId),
      ),
    )
    .returning({ id: trainingProgramTrainers.id });
  return deleted.length > 0;
}

// --- Batches ---
// Soft delete (deleted_at): schema.sql gives batches a deleted_at column,
// same mechanism as colleges/departments/training_programs. Note: batches
// has NO academic_year_id column, and no direct college_id/department_id
// either (checked schema.sql directly, didn't assume) — only
// training_program_id. collegeId/departmentId/studentCount below all come
// from joins, not columns on this table.

export interface ListBatchesParams {
  collegeId: string;
  trainingProgramId?: string;
  page: number;
  pageSize: number;
}

// Enriched read shape for listBatches — same "explicit named-column select
// alongside joins" pattern as students.repository.ts's
// StudentProfileWithNames, for the same reason: BatchListPage's card grid
// needs collegeName/departmentName/studentCount displayed per batch, not
// just the raw batches row.
//
// Omits commonPasswordHash/deletedAt deliberately — same principle as
// users.types.ts's SafeUser omitting passwordHash. commonPasswordHash must
// never leave the server in any list/response shape (it's a real argon2
// hash once a batch has one set); deletedAt is non-sensitive but pointless
// here (these queries already filter to non-deleted rows, so it's always
// null) and dropped for the same cleaner-public-contract reason. Single-row
// batch responses (getBatchById/createBatch/updateBatch/toggleBatchActive)
// are redacted separately in organization.controller.ts's toPublicBatch,
// since the internal Batch type — hash included — is still needed
// server-side (students.service.ts reads batch.commonPasswordHash directly
// to seed new students' password hashes).
export interface BatchWithDetails extends Omit<Batch, 'commonPasswordHash' | 'deletedAt'> {
  collegeName: string;
  departmentName: string;
  studentCount: number;
}

export interface ListBatchesResult {
  items: BatchWithDetails[];
  total: number;
}

function buildBatchesWhere(collegeId: string, trainingProgramId?: string) {
  const conditions = [isNull(batches.deletedAt), eq(trainingPrograms.collegeId, collegeId)];
  if (trainingProgramId) conditions.push(eq(batches.trainingProgramId, trainingProgramId));
  return and(...conditions);
}

// trainingPrograms/colleges/departments are all INNER JOINs, not LEFT —
// unlike students.repository.ts's name-joins (which guard against a
// nullable FK), batches.trainingProgramId and training_programs'
// collegeId/departmentId are all NOT NULL, so a batch can never actually be
// missing this chain; no risk of silently dropping a row.
async function listBatches(params: ListBatchesParams): Promise<ListBatchesResult> {
  const { collegeId, trainingProgramId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = buildBatchesWhere(collegeId, trainingProgramId);

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: batches.id,
        trainingProgramId: batches.trainingProgramId,
        name: batches.name,
        maxStudents: batches.maxStudents,
        status: batches.status,
        createdAt: batches.createdAt,
        updatedAt: batches.updatedAt,
        createdBy: batches.createdBy,
        updatedBy: batches.updatedBy,
        collegeName: colleges.name,
        departmentName: departments.name,
        // Active enrollments only — a dropped/transferred/completed
        // enrollment shouldn't inflate the displayed headcount, same
        // 'active'-only filtering precedent as students.repository.ts's
        // listActiveBatchIdsForStudent.
        studentCount: sql<number>`count(${trainingProgramStudents.id}) filter (where ${trainingProgramStudents.status} = 'active')`,
      })
      .from(batches)
      .innerJoin(trainingPrograms, eq(trainingPrograms.id, batches.trainingProgramId))
      .innerJoin(colleges, eq(colleges.id, trainingPrograms.collegeId))
      .innerJoin(departments, eq(departments.id, trainingPrograms.departmentId))
      .leftJoin(trainingProgramStudents, eq(trainingProgramStudents.batchId, batches.id))
      .where(where)
      .groupBy(batches.id, colleges.name, departments.name)
      .orderBy(asc(batches.name))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(distinct ${batches.id})` })
      .from(batches)
      .innerJoin(trainingPrograms, eq(trainingPrograms.id, batches.trainingProgramId))
      .where(where),
  ]);

  // count(...) is a Postgres bigint — the driver returns it as a STRING, not
  // a genuine JS number (confirmed live: the raw response had
  // "studentCount": "28", not 28), same reason every OTHER list function in
  // this codebase already wraps its `total` in Number(...). The `sql<number>`
  // type annotation above is a compile-time hint only; it doesn't coerce
  // anything at runtime, so this per-row field needs the same explicit
  // conversion the pagination total already gets.
  const itemsWithNumericCount = items.map((item) => ({
    ...item,
    studentCount: Number(item.studentCount),
  }));

  return { items: itemsWithNumericCount, total: Number(totalRows[0]?.count ?? 0) };
}

async function findBatchById(id: string): Promise<Batch | undefined> {
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.id, id), isNull(batches.deletedAt)))
    .limit(1);
  return batch;
}

export interface CreateBatchData {
  trainingProgramId: string;
  name: string;
  maxStudents?: number | null;
  commonPasswordHash: string;
  createdBy: string | null;
}

async function createBatch(data: CreateBatchData): Promise<Batch> {
  const [batch] = await db.insert(batches).values(data).returning();
  return batch;
}

// trainingProgramId not part of the update surface — same reasoning as
// every other structural-anchor FK in this file.
export interface UpdateBatchData {
  name?: string;
  maxStudents?: number | null;
  status?: 'active' | 'completed' | 'archived';
  updatedBy?: string | null;
}

async function updateBatch(id: string, data: UpdateBatchData): Promise<Batch | undefined> {
  const [updated] = await db
    .update(batches)
    .set(data)
    .where(and(eq(batches.id, id), isNull(batches.deletedAt)))
    .returning();
  return updated;
}

async function deleteBatch(id: string): Promise<boolean> {
  const [deleted] = await db
    .update(batches)
    .set({ deletedAt: new Date() })
    .where(and(eq(batches.id, id), isNull(batches.deletedAt)))
    .returning({ id: batches.id });
  return Boolean(deleted);
}

// --- My Batches (Phase 4) ---
// Same enriched BatchWithDetails shape as listBatches above (collegeName/
// departmentName/studentCount), but filtered through batch_trainers by
// trainerId instead of through training_programs by collegeId — different
// enough in WHERE/JOIN shape (no collegeId requirement at all here; a
// trainer's own batches are whatever they're assigned to, full stop) that
// this is a separate function rather than folding a trainerId branch into
// listBatches' existing one, at the cost of some duplication between the
// two column lists.
export interface ListMyBatchesParams {
  trainerId: string;
  page: number;
  pageSize: number;
}

async function listMyBatches(params: ListMyBatchesParams): Promise<ListBatchesResult> {
  const { trainerId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = and(isNull(batches.deletedAt), eq(batchTrainers.trainerId, trainerId));

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: batches.id,
        trainingProgramId: batches.trainingProgramId,
        name: batches.name,
        maxStudents: batches.maxStudents,
        status: batches.status,
        createdAt: batches.createdAt,
        updatedAt: batches.updatedAt,
        createdBy: batches.createdBy,
        updatedBy: batches.updatedBy,
        collegeName: colleges.name,
        departmentName: departments.name,
        studentCount: sql<number>`count(${trainingProgramStudents.id}) filter (where ${trainingProgramStudents.status} = 'active')`,
      })
      .from(batches)
      .innerJoin(batchTrainers, eq(batchTrainers.batchId, batches.id))
      .innerJoin(trainingPrograms, eq(trainingPrograms.id, batches.trainingProgramId))
      .innerJoin(colleges, eq(colleges.id, trainingPrograms.collegeId))
      .innerJoin(departments, eq(departments.id, trainingPrograms.departmentId))
      .leftJoin(trainingProgramStudents, eq(trainingProgramStudents.batchId, batches.id))
      .where(where)
      .groupBy(batches.id, colleges.name, departments.name)
      .orderBy(asc(batches.name))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(distinct ${batches.id})` })
      .from(batches)
      .innerJoin(batchTrainers, eq(batchTrainers.batchId, batches.id))
      .where(where),
  ]);

  // Same bigint-as-string fix as listBatches above.
  const itemsWithNumericCount = items.map((item) => ({
    ...item,
    studentCount: Number(item.studentCount),
  }));

  return { items: itemsWithNumericCount, total: Number(totalRows[0]?.count ?? 0) };
}

// --- Batch trainers (Phase 4) ---
// Hard delete, no deleted_at column — same reasoning as training_program_
// trainers above: pure join/assignment membership, not an audit-worthy
// entity of its own.

export interface ListBatchTrainersParams {
  batchId: string;
  page: number;
  pageSize: number;
}

export interface ListBatchTrainersResult {
  items: BatchTrainer[];
  total: number;
}

async function listBatchTrainers(params: ListBatchTrainersParams): Promise<ListBatchTrainersResult> {
  const { batchId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = eq(batchTrainers.batchId, batchId);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(batchTrainers)
      .where(where)
      .orderBy(asc(batchTrainers.assignedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(batchTrainers).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

// Used both for the pre-insert duplicate check (UNIQUE(batch_id,
// trainer_id)) and — critically — by organization.service.ts's
// unassignTrainerFromBatch to confirm "is this trainer CURRENTLY assigned
// to this batch" server-side before letting a Faculty caller touch the
// assignment, not just trusting their role.
async function findBatchTrainer(batchId: string, trainerId: string): Promise<BatchTrainer | undefined> {
  const [assignment] = await db
    .select()
    .from(batchTrainers)
    .where(and(eq(batchTrainers.batchId, batchId), eq(batchTrainers.trainerId, trainerId)))
    .limit(1);
  return assignment;
}

export interface CreateBatchTrainerData {
  batchId: string;
  trainerId: string;
  assignedBy: string | null;
}

async function createBatchTrainer(data: CreateBatchTrainerData): Promise<BatchTrainer> {
  const [assignment] = await db.insert(batchTrainers).values(data).returning();
  return assignment;
}

async function deleteBatchTrainer(batchId: string, trainerId: string): Promise<boolean> {
  const deleted = await db
    .delete(batchTrainers)
    .where(and(eq(batchTrainers.batchId, batchId), eq(batchTrainers.trainerId, trainerId)))
    .returning({ id: batchTrainers.id });
  return deleted.length > 0;
}

// --- Deactivation cascade (Phase 4, the high-risk piece) ---
//
// Session-invalidation finding (stated here since this is the function it
// governs): this codebase has no per-user "revoke all sessions" primitive.
// Access tokens (authenticate.plugin.ts) are stateless JWTs verified by
// signature+expiry ALONE — no DB/Redis lookup per request at all — so an
// already-issued access token keeps authenticating until it naturally
// expires (JWT_ACCESS_EXPIRY, 15m in this env), regardless of anything this
// function does. Refresh tokens carry a `jti`, but the server only ever
// learns a jti at the moment a token is PRESENTED (rotate-on-use into a
// Redis blocklist, see auth.service.ts's revokeRefreshTokenId) — there is
// no server-side index of "which jtis currently belong to user X" to bulk
// -revoke from. What DOES already exist, and IS the real lever here: both
// auth.service.ts's login() and refresh() already reject when
// !user.isActive. So users.is_active is the actual, only "kill this
// user's ability to start or renew a session" switch this codebase has —
// not a Redis blocklist insert (there's no addressable token to blocklist
// for a student who isn't mid-request), just this flag, which the
// pre-existing login/refresh code already checks. See
// students-deactivation.test.ts for this proven against a REAL login+
// refresh, not just asserting the DB row.
// collegeId travels alongside each userId (not just a bare userId[]) so
// organization.service.ts can invalidate EACH student's permission cache
// with the right key — permissionCache's own key is scoped by
// (userId, collegeId) TOGETHER (see permission-cache.ts's permissionsKey),
// and every student is college-scoped, never global, so passing null there
// would invalidate a cache entry that was never actually populated,
// silently leaving their real cached permissions untouched.
export interface DeactivateBatchCascadeResult {
  batch: Batch;
  affectedUsers: Array<{ userId: string; collegeId: string }>;
}

async function deactivateBatchCascade(
  batchId: string,
  updatedBy: string,
): Promise<DeactivateBatchCascadeResult> {
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .update(batches)
      .set({ status: 'archived', updatedBy })
      .where(eq(batches.id, batchId))
      .returning();

    // Only currently-active enrollments in THIS batch, matching
    // listActiveBatchIdsForStudent's own 'active'-only precedent — a
    // dropped/transferred/completed enrollment shouldn't have its user
    // account touched by this batch's deactivation.
    const affectedStudents = await tx
      .select({ userId: studentProfiles.userId, collegeId: studentProfiles.collegeId })
      .from(trainingProgramStudents)
      .innerJoin(studentProfiles, eq(studentProfiles.id, trainingProgramStudents.studentId))
      .where(
        and(
          eq(trainingProgramStudents.batchId, batchId),
          eq(trainingProgramStudents.status, 'active'),
        ),
      );

    const affectedUserIds = affectedStudents.map((row) => row.userId);

    if (affectedUserIds.length > 0) {
      await tx.update(users).set({ isActive: false }).where(inArray(users.id, affectedUserIds));
    }

    return { batch, affectedUsers: affectedStudents };
  });
}

// --- Activation cascade (bugfix, symmetric to deactivateBatchCascade) ---
//
// Confirmed live bug: sanjay@gmail.com's batch ("Byters") had been
// deactivated then reactivated. Its `status` column correctly read 'active'
// again, but his `users.is_active` was STILL false — organization.
// service.ts's toggleBatchActive originally treated archived -> active as
// a plain status flip with no student-side reversal at all (a deliberate
// Phase 4 design choice per that function's own comment, which turned out
// to be wrong in practice: real students can never log back in once their
// batch is reactivated). This function is the missing reverse cascade.
//
// Reactivation scope: only students with (a) a currently-active enrollment
// in THIS batch (same 'active'-only filter as deactivateBatchCascade) AND
// (b) a student_profiles.status of 'active'. That second condition is
// deliberate and was checked against live data before deciding: sanjay's
// own student_profiles.status stayed 'active' throughout (confirmed via a
// direct SELECT) — it's a genuinely independent signal from users.is_active,
// tracking whether the STUDENT PROFILE ITSELF has been archived for
// unrelated reasons (withdrawal, transfer, etc.), not whether their login
// was suspended by a batch toggle. Without this guard, reactivating a batch
// would incorrectly resurrect the login of a student who was independently
// archived through some other flow. Enrollment status alone isn't a
// sufficient proxy for that — a profile can be archived while its
// enrollment row is still nominally 'active' — so both are checked.
//
// Stated limitation, not solved here: users.is_active is a single boolean
// with no history/reason field, so this cascade cannot distinguish "this
// account was deactivated BY this batch's own prior deactivation" from
// "this account was independently set inactive via PATCH /users/:id for an
// unrelated reason, while its enrollment and profile both still read
// 'active'". That second, narrower case would still get reactivated here.
// Closing it fully would need an audit/reason column this schema doesn't
// have — flagged rather than silently guessed around.
//
// No permissionCache action needed here (unlike the deactivate path, which
// explicitly invalidates): a deactivated student's cache entry is already
// missing/cleared from that deactivation, and login()/refresh() being
// rejected all along means nothing repopulated it since. The first
// successful login after reactivation calls resolvePermissionsForUser
// itself (see auth.service.ts's login()), which populates the cache fresh
// — there's nothing stale to proactively clear on this path.
async function activateBatchCascade(
  batchId: string,
  updatedBy: string,
): Promise<DeactivateBatchCascadeResult> {
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .update(batches)
      .set({ status: 'active', updatedBy })
      .where(eq(batches.id, batchId))
      .returning();

    const affectedStudents = await tx
      .select({ userId: studentProfiles.userId, collegeId: studentProfiles.collegeId })
      .from(trainingProgramStudents)
      .innerJoin(studentProfiles, eq(studentProfiles.id, trainingProgramStudents.studentId))
      .where(
        and(
          eq(trainingProgramStudents.batchId, batchId),
          eq(trainingProgramStudents.status, 'active'),
          eq(studentProfiles.status, 'active'),
        ),
      );

    const affectedUserIds = affectedStudents.map((row) => row.userId);

    if (affectedUserIds.length > 0) {
      await tx.update(users).set({ isActive: true }).where(inArray(users.id, affectedUserIds));
    }

    return { batch, affectedUsers: affectedStudents };
  });
}

export const organizationRepository = {
  listColleges,
  findCollegeById,
  findCollegeByCode,
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
  findTrainingProgramTrainer,
  createTrainingProgramTrainer,
  deleteTrainingProgramTrainer,
  listBatches,
  findBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
  listMyBatches,
  listBatchTrainers,
  findBatchTrainer,
  createBatchTrainer,
  deleteBatchTrainer,
  deactivateBatchCascade,
  activateBatchCascade,
};
