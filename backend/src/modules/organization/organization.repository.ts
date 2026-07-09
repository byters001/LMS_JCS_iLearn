import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  academicYears,
  batches,
  colleges,
  departments,
  trainingProgramTrainers,
  trainingPrograms,
} from '../../db/schema/organization.schema';
import type {
  AcademicYear,
  Batch,
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
// has NO academic_year_id column at all (checked schema.sql directly,
// didn't assume) — only training_program_id.

export interface ListBatchesParams {
  trainingProgramId?: string;
  page: number;
  pageSize: number;
}

export interface ListBatchesResult {
  items: Batch[];
  total: number;
}

function buildBatchesWhere(trainingProgramId?: string) {
  const conditions = [isNull(batches.deletedAt)];
  if (trainingProgramId) conditions.push(eq(batches.trainingProgramId, trainingProgramId));
  return and(...conditions);
}

async function listBatches(params: ListBatchesParams): Promise<ListBatchesResult> {
  const { trainingProgramId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = buildBatchesWhere(trainingProgramId);

  const [items, totalRows] = await Promise.all([
    db.select().from(batches).where(where).orderBy(asc(batches.name)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(batches).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
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
};
