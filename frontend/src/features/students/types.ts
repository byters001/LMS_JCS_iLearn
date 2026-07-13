// Frontend-side types for the "students" feature (own copy, not shared with
// the backend's *.types.ts). Matches the RAW student_profiles row shape —
// backend/src/modules/students/students.repository.ts's listStudentProfiles
// is a plain `db.select().from(studentProfiles)`, no join to users or
// departments. userId/departmentId/collegeId are bare UUIDs here, NOT
// resolved fullName/department-name strings — confirmed against the
// backend, not assumed.
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
