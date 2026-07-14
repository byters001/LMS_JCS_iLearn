// Frontend-side types for the "trainers" feature (own copy, not shared with
// the backend's *.types.ts).

// Matches backend/src/db/schema/trainers.schema.ts's session_type_enum /
// session_status_enum.
export type TrainingSessionType =
  | 'aptitude'
  | 'reasoning'
  | 'coding'
  | 'soft_skills'
  | 'interview'
  | 'other'
export type TrainingSessionStatus = 'scheduled' | 'completed' | 'cancelled'

// Matches the raw training_sessions row shape — backend/src/modules/trainers/
// trainers.repository.ts's listTrainingSessions is a plain
// `db.select().from(trainingSessions)`, no join in a resolved program name.
export interface TrainingSession {
  id: string
  trainingProgramId: string
  title: string
  description: string | null
  sessionNumber: number
  sessionDate: string
  startTime: string | null
  endTime: string | null
  sessionType: TrainingSessionType
  status: TrainingSessionStatus
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

// Matches backend/src/modules/trainers/trainers.schema.ts's
// listTrainingSessionsQuerySchema.
export interface ListTrainingSessionsParams {
  page?: number
  pageSize?: number
  trainingProgramId?: string
}

// Matches backend/src/modules/trainers/trainers.types.ts's ListTrainingSessionsResult.
export interface ListTrainingSessionsResponse {
  items: TrainingSession[]
  total: number
  page: number
  pageSize: number
}
