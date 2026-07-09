import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { academicYears, colleges, departments } from '../../db/schema/organization.schema';
import type { AcademicYear, College, Department } from '../../db/types';

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
};
