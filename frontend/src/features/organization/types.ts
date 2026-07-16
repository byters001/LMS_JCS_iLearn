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

export interface College {
  id: string
  name: string
  code: string
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

export interface Department {
  id: string
  collegeId: string
  name: string
  code: string | null
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
