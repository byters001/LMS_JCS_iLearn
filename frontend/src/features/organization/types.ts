// Frontend-side types for the "organization" feature (own copy, not shared with
// the backend's *.types.ts).
export type BatchStatus = 'active' | 'completed' | 'archived'

// Matches backend/src/modules/organization/organization.repository.ts's
// BatchWithDetails (the enriched read shape GET /batches actually returns —
// collegeName/departmentName/studentCount come from joins, not raw columns
// on the batches row). commonPasswordHash is deliberately NOT included here:
// the frontend never has a reason to see the hash value itself.
export interface Batch {
  id: string
  trainingProgramId: string
  name: string
  maxStudents: number | null
  status: BatchStatus
  collegeName: string
  departmentName: string
  studentCount: number
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

// collegeId is REQUIRED — matches backend/.../organization.schema.ts's
// listBatchesQuerySchema exactly (confirmed by reading the real schema):
// batches has no direct college_id column, so the backend enforces this via
// a join through training_programs, AND rejects a caller whose own
// activeCollegeId doesn't match. Enforced server-side, not just this type.
export interface ListBatchesParams {
  collegeId: string
  trainingProgramId?: string
  page?: number
  pageSize?: number
}

export interface ListBatchesResponse {
  items: Batch[]
  total: number
  page: number
  pageSize: number
}

// Matches createBatchSchema exactly — trainingProgramId (not raw
// collegeId/departmentId/academicYearId; batches.training_program_id is a
// real, existing NOT NULL FK, and training_programs already carries
// college/department/academicYear — see CreateBatchPage.tsx's own comment
// for why this picks an existing training program instead).
export interface CreateBatchInput {
  trainingProgramId: string
  name: string
  maxStudents?: number
  commonPassword: string
}

// Matches updateBatchSchema exactly (.strict(), all fields optional) —
// status IS in the real backend schema here too, but EditBatchDialog.tsx
// deliberately never sends it: batches.toggle_active (BatchCard's own
// Switch) already owns that concern via its own dedicated permission
// ('batches.toggle_active', super_admin-only), and item 10 tier 2's own
// scope is explicitly "Edit (name/maxStudents...)" — folding status into
// the same form would create two UI paths to the same field.
export interface UpdateBatchInput {
  name?: string
  maxStudents?: number
  status?: BatchStatus
}

export type CollegeStatus = 'active' | 'expired' | 'archived'

// Expanded (item 10 tier 1) from the original id/name/code-only shape once
// CollegeListPage needed the real columns to display/edit — matches
// backend/src/db/schema/organization.schema.ts's colleges table exactly
// (InferSelectModel via db/types.ts's College), minus deletedAt (GET
// /colleges already filters soft-deleted rows out server-side, so a row
// reaching the frontend is never actually deleted — carrying the column
// here would only ever be null noise).
export interface College {
  id: string
  name: string
  code: string
  logoUrl: string | null
  address: string | null
  contactEmail: string | null
  contactPhone: string | null
  contractStartDate: string | null
  contractEndDate: string | null
  status: CollegeStatus
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface ListCollegesParams {
  page?: number
  pageSize?: number
}

export interface ListCollegesResponse {
  items: College[]
  total: number
  page: number
  pageSize: number
}

// Matches createCollegeSchema exactly (.strict()) — status is deliberately
// absent here (schema.sql defaults it to 'active' at creation; there is no
// create-time override).
export interface CreateCollegeInput {
  name: string
  code: string
  logoUrl?: string
  address?: string
  contactEmail?: string
  contactPhone?: string
  contractStartDate?: string
  contractEndDate?: string
}

// Matches updateCollegeSchema exactly (.strict(), all fields optional,
// backend rejects an empty body) — status IS editable here, the one field
// create doesn't accept.
export interface UpdateCollegeInput {
  name?: string
  code?: string
  logoUrl?: string
  address?: string
  contactEmail?: string
  contactPhone?: string
  contractStartDate?: string
  contractEndDate?: string
  status?: CollegeStatus
}

// Expanded the same way College was above — matches db/types.ts's
// Department (InferSelectModel) exactly, minus deletedAt for the same
// "never actually reaches the frontend" reason.
export interface Department {
  id: string
  collegeId: string
  name: string
  code: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface ListDepartmentsParams {
  collegeId?: string
  page?: number
  pageSize?: number
}

export interface ListDepartmentsResponse {
  items: Department[]
  total: number
  page: number
  pageSize: number
}

// Matches createDepartmentSchema exactly — collegeId is required (a
// department can't exist unscoped).
export interface CreateDepartmentInput {
  collegeId: string
  name: string
  code?: string
}

// Matches updateDepartmentSchema exactly — collegeId deliberately excluded
// (re-parenting a department to a different college isn't part of this
// schema; confirmed by reading the real backend schema, not assumed).
export interface UpdateDepartmentInput {
  name?: string
  code?: string
}

export type TrainingProgramStatus = 'planned' | 'ongoing' | 'completed' | 'archived'

export interface TrainingProgram {
  id: string
  collegeId: string
  departmentId: string
  name: string
  status: TrainingProgramStatus
}

export interface ListTrainingProgramsParams {
  collegeId?: string
  departmentId?: string
  page?: number
  pageSize?: number
}

export interface ListTrainingProgramsResponse {
  items: TrainingProgram[]
  total: number
  page: number
  pageSize: number
}

// Matches createTrainingProgramSchema exactly (.strict()) — departmentId is
// required (a training program can't exist unscoped from a department,
// mirroring CreateDepartmentInput's own collegeId requirement above).
export interface CreateTrainingProgramInput {
  collegeId: string
  departmentId: string
  academicYearId?: string
  name: string
  description?: string
  startDate?: string
  endDate?: string
}

// Matches backend/src/modules/organization/organization.repository.ts's
// batchTrainers row shape exactly — this endpoint returns the raw
// batch_trainers row (no joined trainer name/email); the picker/list UI
// cross-references trainerId against useUsers' own list to display a name.
export interface BatchTrainer {
  id: string
  batchId: string
  trainerId: string
  assignedBy: string | null
  assignedAt: string
}

export interface ListBatchTrainersParams {
  page?: number
  pageSize?: number
}

export interface ListBatchTrainersResponse {
  items: BatchTrainer[]
  total: number
  page: number
  pageSize: number
}

export interface AssignBatchTrainerInput {
  trainerId: string
}

// GET /batches/mine — self-scoped, no params beyond pagination (matches
// listMyBatchesQuerySchema exactly).
export interface ListMyBatchesParams {
  page?: number
  pageSize?: number
}
