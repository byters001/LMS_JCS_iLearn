// One student's classified result for a batch-performance report. Richer
// than a plain pass/fail: 'not_attempted' (no real attempt exists at
// all), 'in_progress' (started, not finished), 'pending_evaluation'
// (matches attempt_status_enum — a coding response never finished
// grading), 'invalidated' (proctoring-flagged, excluded from scoring),
// 'passed'/'failed' (a real 'submitted' attempt, classified against the
// resolved passing threshold). See analytics.service.ts's classifyStudent
// for the exact priority order when a student has multiple attempts in
// different states.
export type PerStudentStatus =
  | 'not_attempted'
  | 'in_progress'
  | 'pending_evaluation'
  | 'invalidated'
  | 'passed'
  | 'failed';

export interface PerStudentPerformanceRow {
  studentId: string;
  fullName: string;
  attemptId: string | null;
  totalScore: string | null;
  status: PerStudentStatus;
}

export interface ScoreDistribution {
  min: string | null;
  max: string | null;
  median: string | null;
}

// How the passing threshold was determined (item 1's explicit ask) —
// see analytics.service.ts's module comment for the full reasoning.
// absoluteThreshold is only set when source === 'sections' (a single
// fixed number, safe to compare every attempt against); when source ===
// 'fallback_percentage', there is deliberately NO single absolute number
// here, because pool-based sections can draw a different total possible
// marks per attempt — fallbackPercentage (the fixed thing in that case)
// is applied per-attempt against THAT attempt's own total possible marks
// instead.
export interface PassingThresholdInfo {
  source: 'sections' | 'fallback_percentage';
  absoluteThreshold: string | null;
  fallbackPercentage: number | null;
}

// Phase 5 (trainer performance trend) — one point per (batch, assessment)
// pair a trainer's batches have real attempt activity on, ordered
// chronologically by attemptedAt. Deliberately one row per assessment
// rather than one pooled number across all of them — same scale-mixing
// reasoning as BatchPerformanceSummary above (getBatchPerformance's own
// module comment): different assessments can have wildly different total
// possible marks, so a trend chart plots them as separate points instead
// of averaging incompatible scales together.
export interface TrainerPerformanceTrendPoint {
  batchId: string;
  assessmentId: string;
  assessmentTitle: string;
  attemptedAt: string;
  averageScore: string | null;
  passRate: number | null;
  totalStudents: number;
  studentsAttempted: number;
}

export interface BatchPerformanceSummary {
  batchId: string;
  assessmentId: string;
  assessmentTitle: string;
  passingThreshold: PassingThresholdInfo;
  // totalStudents = every active student in the batch (attempted or
  // not); studentsAttempted excludes 'not_attempted'. averageScore/
  // passRate/scoreDistribution are computed ONLY over 'passed'/'failed'
  // rows (a real, graded 'submitted' attempt) — 'pending_evaluation'/
  // 'invalidated'/'in_progress'/'not_attempted' rows are excluded from
  // these aggregates since their score is either absent, provisional, or
  // tainted. Null when there are zero qualifying rows, not NaN/0.
  totalStudents: number;
  studentsAttempted: number;
  averageScore: string | null;
  passRate: number | null;
  scoreDistribution: ScoreDistribution;
  // Paginated (item 4) — see analytics.service.ts's module comment for
  // why the aggregates above are computed over the FULL batch but this
  // list is still paginated.
  students: PerStudentPerformanceRow[];
  page: number;
  pageSize: number;
}

// --- Batch assessment participation (item 10 part 1) ---
// One row per assessment assigned to the batch (analytics.repository.ts's
// listAssessmentsAssignedToBatch — 'scheduled'/'live'/'completed'/
// 'archived' only, see that function's own STATUSES_WITH_PARTICIPATION
// comment for why draft-lifecycle statuses are excluded). totalStudents is
// the SAME number on every row (the batch's
// own active roster size — see BatchAssessmentParticipationResult below),
// repeated per-row so each row is independently meaningful without the
// caller having to cross-reference the parent object. participationRate
// is null (not 0/NaN) when totalStudents is 0 — an empty batch has no
// meaningful rate, not a 0% one.
export interface BatchAssessmentParticipationRow {
  assessmentId: string;
  assessmentTitle: string;
  status: string;
  testCategory: string;
  startAt: string | null;
  endAt: string | null;
  studentsAttempted: number;
  totalStudents: number;
  participationRate: number | null;
}

export interface BatchAssessmentParticipationResult {
  batchId: string;
  batchName: string;
  totalStudents: number;
  assessments: BatchAssessmentParticipationRow[];
}

// --- Attendance-by-date (Phase 6a chatbot tool) ---
// See analytics.repository.ts's listTrainingSessionsOnDate comment: this
// reports SESSIONS held on a date, not per-student physical presence —
// there is no attendance/roll-call table in this schema. sessionType/
// status are kept as `string` here rather than the narrower Drizzle enum
// unions (matching this file's existing convention of not re-deriving
// pgEnum types into every read shape).
export interface AttendanceSessionRow {
  sessionId: string;
  title: string;
  sessionType: string;
  status: string;
  trainingProgramId: string;
  collegeId: string;
  collegeName: string;
  departmentName: string;
}

export interface AttendanceByDateResult {
  date: string;
  // The scope actually applied — always non-null for a Faculty caller
  // (forced to their own activeCollegeId even if omitted from the
  // request), null only for a Super Admin who didn't narrow to one
  // college. See analytics.service.ts's getAttendanceByDate.
  collegeId: string | null;
  sessions: AttendanceSessionRow[];
  totalSessions: number;
  completedSessions: number;
}

// --- Score percentages (item 8B, student leaderboard) ---
// One attempt's score expressed as a percentage of ITS OWN total possible
// marks (not a fixed platform-wide scale) — see analytics.service.ts's
// getScorePercentagesForAttempts for why this is computed per-attempt
// rather than per-assessment.
export interface AttemptScorePercentage {
  attemptId: string;
  scorePercent: number;
}

// --- Failed students (Phase 6a chatbot tool) ---
// Reuses getBatchPerformance's own PerStudentPerformanceRow/classification
// as-is (filtered to status === 'failed') — no separate pass/fail
// computation exists here. Grouped by batch since "failed students on this
// assessment" can span multiple batches when batchId is omitted (see
// analytics.service.ts's getFailedStudents).
export interface FailedStudentsBatchGroup {
  batchId: string;
  batchName: string;
  students: PerStudentPerformanceRow[];
}

export interface FailedStudentsResult {
  assessmentId: string;
  assessmentTitle: string;
  batches: FailedStudentsBatchGroup[];
  totalFailedStudents: number;
}
