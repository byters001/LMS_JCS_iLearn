// Frontend-side types for the "assessments" feature (own copy, not shared
// with the backend's *.types.ts). Matches the raw `assessments` row shape
// returned by GET /assessments/available (backend/src/db/schema/assessments.schema.ts).
export type TestCategory = 'mcq' | 'coding' | 'psychometric' | 'mixed'

export type AssessmentStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'scheduled'
  | 'live'
  | 'completed'
  | 'archived'

export interface Assessment {
  id: string
  trainingSessionId: string
  title: string
  description: string | null
  testCategory: TestCategory
  timerMinutes: number | null
  startAt: string | null
  endAt: string | null
  maxAttempts: number
  shuffleQuestions: boolean
  randomQuestionCount: number | null
  negativeMarking: boolean
  negativeMarkingValue: string | null
  proctoringCameraRequired: boolean
  proctoringFullscreenRequired: boolean
  isPractice: boolean
  status: AssessmentStatus
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

// Matches backend/src/modules/assessments/assessments.schema.ts's
// listAvailableAssessmentsQuerySchema — student-scoped (batch-authorized
// only), status restricted to 'scheduled' | 'live'.
export interface ListAvailableAssessmentsParams {
  page?: number
  pageSize?: number
  status?: 'scheduled' | 'live'
}

export interface ListAvailableAssessmentsResponse {
  items: Assessment[]
  total: number
  page: number
  pageSize: number
}

// Staff-facing GET /assessments (NOT /assessments/available — that one's
// student-scoped, resolved from the caller's own batch membership; this is
// the full platform-wide list, gated by the assessments.create permission
// per assessments.routes.ts). Matches backend/assessments.schema.ts's
// listAssessmentsQuerySchema exactly: trainingSessionId/status/testCategory
// are all optional filters the backend already supports, kept here for
// type completeness even though this phase's UI doesn't expose filter
// controls yet (read-only listing only, same scope discipline as
// StudentListPage.tsx).
export interface ListAssessmentsParams {
  page?: number
  pageSize?: number
  trainingSessionId?: string
  status?: AssessmentStatus
  testCategory?: TestCategory
}

export interface ListAssessmentsResult {
  items: Assessment[]
  total: number
  page: number
  pageSize: number
}
