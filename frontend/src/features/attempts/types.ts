// Frontend-side types for the "attempts" feature (own copy, not shared with
// the backend's *.types.ts). Matches the raw assessment_attempts row shape
// returned by POST /attempts (backend/src/db/schema/attempts.schema.ts).
export type AttemptStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'pending_evaluation'
  | 'invalidated'

export interface Attempt {
  id: string
  assessmentId: string
  studentId: string
  attemptNumber: number
  status: AttemptStatus
  startTime: string | null
  endTime: string | null
  submissionTime: string | null
  ipAddress: string | null
  browserInfo: string | null
  totalScore: string | null
  rankInBatch: number | null
  isRetake: boolean
  createdAt: string
  updatedAt: string
}
