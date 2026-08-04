// Frontend-side types for the "analytics" feature (own copy, not shared with
// the backend's *.types.ts). Matches backend/src/modules/analytics/
// analytics.types.ts's BatchPerformanceSummary exactly.
export type PerStudentStatus =
  | 'not_attempted'
  | 'in_progress'
  | 'pending_evaluation'
  | 'invalidated'
  | 'passed'
  | 'failed'

export interface PerStudentPerformanceRow {
  studentId: string
  fullName: string
  attemptId: string | null
  totalScore: string | null
  status: PerStudentStatus
}

// null fields are a real, expected state (zero qualifying — 'passed'/
// 'failed' — rows yet), not a loading placeholder.
export interface ScoreDistribution {
  min: string | null
  max: string | null
  median: string | null
}

export interface PassingThresholdInfo {
  source: 'sections' | 'fallback_percentage'
  absoluteThreshold: string | null
  fallbackPercentage: number | null
}

export interface BatchPerformanceSummary {
  batchId: string
  assessmentId: string
  assessmentTitle: string
  passingThreshold: PassingThresholdInfo
  // Every active student in the batch, attempted or not. studentsAttempted
  // excludes 'not_attempted'. averageScore/passRate/scoreDistribution are
  // computed only over 'passed'/'failed' rows — null (not 0/NaN) when
  // there are zero such rows yet.
  totalStudents: number
  studentsAttempted: number
  averageScore: string | null
  passRate: number | null
  scoreDistribution: ScoreDistribution
  // Paginated — see api.ts's useBatchPerformance for why the aggregates
  // above are still computed over the full batch regardless.
  students: PerStudentPerformanceRow[]
  page: number
  pageSize: number
}

// Matches backend's getBatchPerformanceQuerySchema — assessmentId is
// genuinely optional (confirmed by reading the real schema), not just
// absent from this type by omission.
export interface GetBatchPerformanceParams {
  assessmentId?: string
  page?: number
  pageSize?: number
}

// --- Batch assessment participation (item 10 part 1) ---
// Matches backend's BatchAssessmentParticipationRow/Result exactly
// (analytics.types.ts). status/testCategory are kept as `string` here,
// same convention this file already uses for AttendanceSessionRow-style
// rows, rather than re-deriving the backend's Drizzle enum unions.
export interface BatchAssessmentParticipationRow {
  assessmentId: string
  assessmentTitle: string
  status: string
  testCategory: string
  startAt: string | null
  endAt: string | null
  studentsAttempted: number
  totalStudents: number
  participationRate: number | null
}

export interface BatchAssessmentParticipationResult {
  batchId: string
  batchName: string
  totalStudents: number
  assessments: BatchAssessmentParticipationRow[]
}

// --- Super Admin platform analytics ---
// Matches backend's analytics.types.ts PlatformOverview/CollegePerformanceRow/
// CategoryImprovementRow exactly. null fields are a real "loaded, but
// genuinely no qualifying data yet" state (see backend's own comments for
// exactly when each goes null) — never a fabricated 0/NaN.
export interface PlatformOverview {
  totalStudents: number
  activeAssessments: number
  averageScorePercent: number | null
  completionRate: number | null
}

export interface CollegePerformanceRow {
  collegeId: string
  collegeName: string
  averageScorePercent: number | null
  attemptCount: number
}

export interface CategoryImprovementRow {
  categoryId: string
  categoryName: string
  type: 'mcq'
  studentsWithBothAttempts: number
  firstAttemptAvgPercent: number | null
  latestAttemptAvgPercent: number | null
}

// --- Faculty's own analytics (Phase 3) ---
// Matches backend's analytics.types.ts MyOverview/MyBatchPerformanceRow
// exactly. Self-scoped via batch_trainers, never college — no collegeId
// anywhere in this section.
export interface MyOverview {
  totalBatches: number
  totalStudents: number
  activeAssessments: number
  averageScorePercent: number | null
  completionRate: number | null
}

export interface MyBatchPerformanceRow {
  batchId: string
  batchName: string
  averageScorePercent: number | null
  attemptCount: number
}
