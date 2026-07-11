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
