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

// Matches the raw training_sessions row shape, PLUS trainingProgramName —
// backend/src/modules/trainers/trainers.repository.ts's listTrainingSessions
// now joins training_programs (item 4) specifically so a session picker can
// render a distinguishing label: two sessions from different programs can
// share the exact same title (e.g. "Session 1"), and trainingProgramId alone
// isn't human-readable. See CreateAssessmentPage.tsx's dropdown.
export interface TrainingSession {
  id: string
  trainingProgramId: string
  trainingProgramName: string
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

// --- Trainers overview / performance (Phase 5, Super Admin dashboard) ---
// Matches backend/src/modules/trainers/trainers.types.ts's
// TrainerOverviewRow/ListTrainersOverviewResult exactly. "Trainer" here
// means a user holding the 'faculty' role, not a trainer_profiles row —
// see the backend type's own comment for why.
export interface TrainerOverviewNamedRef {
  id: string
  name: string
}

export interface TrainerOverviewRow {
  trainerId: string
  fullName: string
  email: string
  isActive: boolean
  batchCount: number
  colleges: TrainerOverviewNamedRef[]
  departments: TrainerOverviewNamedRef[]
}

export interface ListTrainersOverviewParams {
  page?: number
  pageSize?: number
}

export interface ListTrainersOverviewResponse {
  items: TrainerOverviewRow[]
  total: number
  page: number
  pageSize: number
}

// Matches backend/src/modules/analytics/analytics.types.ts's
// TrainerPerformanceTrendPoint exactly — one point per (batch, assessment)
// pair the trainer's batches have real attempt activity on. averageScore
// is NOT comparable across points (different assessments can have wildly
// different total possible marks — same reasoning as
// features/analytics/types.ts's BatchPerformanceSummary) — only passRate
// (always a 0-1 proportion) is safe to plot as one continuous trend line;
// see TrainerDetailPage.tsx for how this is actually charted.
export interface TrainerPerformanceTrendPoint {
  batchId: string
  assessmentId: string
  assessmentTitle: string
  attemptedAt: string
  averageScore: string | null
  passRate: number | null
  totalStudents: number
  studentsAttempted: number
}

export interface TrainerPerformanceBatchSummary {
  id: string
  name: string
  collegeName: string
  departmentName: string
}

// Matches backend/src/modules/trainers/trainers.types.ts's
// TrainerPerformanceResult.
export interface TrainerPerformanceResult {
  trainerId: string
  fullName: string
  batches: TrainerPerformanceBatchSummary[]
  trend: TrainerPerformanceTrendPoint[]
}
