// Frontend-side types for the "students" feature (own copy, not shared with
// the backend's *.types.ts). Matches backend/src/modules/students/
// students.repository.ts's listStudentProfiles, which now LEFT JOINs
// users/departments/colleges for display names alongside the raw ids
// (StudentProfileWithNames there) — ids are kept here too since some future
// action may still need them, they're just no longer the primary display
// value (see StudentListPage.tsx).
export type StudentStatus = 'active' | 'archived'

export interface StudentProfile {
  id: string
  userId: string
  collegeId: string
  departmentId: string | null
  rollNumber: string | null
  photoUrl: string | null
  contactEmailAlt: string | null
  contactPhone: string | null
  status: StudentStatus
  archivedAt: string | null
  accessRevokedAt: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  // Resolved via LEFT JOIN — null is a real, possible value (an orphaned
  // row, or no department set), not just a loading placeholder.
  fullName: string | null
  departmentName: string | null
  collegeName: string | null
}

// Matches backend's updateStudentProfileSchema exactly (.strict(), all
// fields optional, backend rejects an empty body) — userId/collegeId/
// departmentId are deliberately absent (students.repository.ts's own
// comment: "a department transfer is a deliberate action, not a casual
// profile edit; not exposed in this phase"). status IS included here even
// though item 10 tier 2's dedicated Archive action uses DELETE
// /student-profiles/:id instead — this is the only path back from
// 'archived' to 'active' (the DELETE route is one-directional, confirmed
// by reading students.service.ts's archiveStudentProfile: it throws
// ConflictError if already archived, no un-archive branch), so
// EditStudentDialog's Reactivate button uses this same PATCH with just
// {status: 'active'}.
export interface UpdateStudentProfileInput {
  rollNumber?: string
  photoUrl?: string
  contactEmailAlt?: string
  contactPhone?: string
  status?: StudentStatus
}

// Matches backend/src/modules/students/students.schema.ts's
// listStudentProfilesQuerySchema.
export interface ListStudentProfilesParams {
  page?: number
  pageSize?: number
  collegeId?: string
  departmentId?: string
  batchId?: string
  includeArchived?: boolean
}

// Matches backend/src/modules/students/students.types.ts's ListStudentProfilesResult.
export interface ListStudentProfilesResponse {
  items: StudentProfile[]
  total: number
  page: number
  pageSize: number
}

// --- Bulk student creation (Phase 3) ---
// Matches backend/.../students.schema.ts's studentRowSchema exactly.
// departmentId omitted => falls back to the batch's own training program's
// department server-side (see students.service.ts's createStudentsInBatch).
export interface StudentRowInput {
  fullName: string
  email: string
  rollNumber?: string
  departmentId?: string
}

export interface CreateStudentsInBatchInput {
  students: StudentRowInput[]
}

export interface CreatedStudent {
  studentProfileId: string
  userId: string
  email: string
  fullName: string
}

export interface CreateStudentsInBatchResponse {
  created: CreatedStudent[]
}

// --- CSV export (Phase 3) ---
// Matches backend/.../students.schema.ts's exportBatchStudentsQuerySchema.
export interface ExportStudentsParams {
  limit?: number
  departmentId?: string
  status?: StudentStatus
}
