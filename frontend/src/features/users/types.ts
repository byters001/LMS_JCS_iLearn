// Frontend-side types for the "users" feature (own copy, not shared with
// the backend's *.types.ts). Minimal — only what the trainer picker
// (AssignTrainerDialog) needs right now.
export interface SafeUser {
  id: string
  email: string
  fullName: string
  isActive: boolean
}

// Matches backend/src/modules/users/users.schema.ts's listUsersQuerySchema.
export interface ListUsersParams {
  page?: number
  pageSize?: number
  roleSlug?: string
  collegeId?: string
}

export interface ListUsersResponse {
  items: SafeUser[]
  total: number
  page: number
  pageSize: number
}
