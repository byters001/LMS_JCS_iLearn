// Frontend-side types for the "organization" feature (own copy, not shared with
// the backend's *.types.ts).
export type BatchStatus = 'active' | 'completed' | 'archived'

// Matches the raw `batches` row shape.
export interface Batch {
  id: string
  trainingProgramId: string
  name: string
  maxStudents: number | null
  status: BatchStatus
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

// Matches backend/src/modules/organization/organization.schema.ts's
// listBatchesQuerySchema exactly — confirmed by reading the real schema:
// trainingProgramId/page/pageSize only. No collegeId filter exists on this
// endpoint (batches only relate to a college indirectly, through their
// training program), and no text-search param either.
export interface ListBatchesParams {
  page?: number
  pageSize?: number
  trainingProgramId?: string
}

export interface ListBatchesResponse {
  items: Batch[]
  total: number
  page: number
  pageSize: number
}
