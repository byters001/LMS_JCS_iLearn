import { assessmentsService } from '../assessments/assessments.service';
import { organizationService } from '../organization/organization.service';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error';
import {
  analyticsRepository,
  type BatchAttemptRow,
} from './analytics.repository';
import type { GetBatchPerformanceQuery } from './analytics.schema';
import type {
  BatchPerformanceSummary,
  PassingThresholdInfo,
  PerStudentPerformanceRow,
  PerStudentStatus,
  ScoreDistribution,
} from './analytics.types';

// --- Passing threshold (item 1) ---
//
// Checked schema.sql directly rather than assuming: passing_marks lives
// on assessment_sections, NOT assessments — there is no assessment-level
// passing threshold column at all. Sum of section thresholds is only
// trusted when EVERY section of the assessment has one explicitly set
// (analyticsRepository.findAssessmentSectionsThresholdInfo) — a partial
// sum (some sections missing passing_marks, treated as 0 via COALESCE)
// would silently produce an artificially low threshold that doesn't
// reflect what the assessment's author actually intended, so a partial
// set is treated the same as "no threshold defined at all," not
// silently summed anyway.
//
// Fallback: FALLBACK_PASS_PERCENTAGE (40%) of an attempt's OWN total
// possible marks. Not read from system_settings (the settings module
// built earlier in this session) — nothing seeds a key for this yet, and
// wiring it up would be a deliberate follow-up, not something to invent
// speculatively here. 40% is a common placement/academic pass-cutoff
// convention, stated explicitly as my own call, not derived from
// anything in CLAUDE.md or schema.sql (neither specifies one).
//
// The fallback is applied PER ATTEMPT, not as one fixed number for the
// whole assessment: a pool-based section's frozen selections can draw a
// different set of questions (and therefore a different total possible
// marks) on every attempt, so "40% of total possible marks" can be a
// different absolute number per attempt even for the same assessment.
const FALLBACK_PASS_PERCENTAGE = 0.4;

// Only a 'submitted' attempt has a definitive, fully-graded totalScore —
// see this file's classifyStudent for how every other status is handled.
const QUALIFIABLE_STATUSES: AssessmentAttemptStatus[] = ['submitted'];

type AssessmentAttemptStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'pending_evaluation'
  | 'invalidated';

// Priority order when a student has multiple attempts in different
// states (e.g. one invalidated attempt followed by a legitimate retake):
// the lower number wins. 'submitted' always wins if present at all (its
// own branch is checked first, before this table is even consulted).
const STATUS_PRIORITY: Record<AssessmentAttemptStatus, number> = {
  submitted: 0,
  pending_evaluation: 1,
  invalidated: 2,
  in_progress: 3,
  not_started: 4,
};

// --- College scoping (item 3) ---
//
// Confirmed the batch->college path directly against schema.sql: batches
// has NO college_id column of its own — it's two hops away
// (batches.training_program_id -> training_programs.college_id).
// Resolved via organizationService.findBatchById + findTrainingProgramById
// (both already-existing cross-module SERVICE calls, reused rather than
// re-queried here, matching item 1's "reuse... don't duplicate" ask
// extended to this lookup too).
//
// Bypass condition, confirmed against auth.service.ts's own
// resolveActiveCollegeId rather than assumed: a user's activeCollegeId is
// null UNLESS they hold EXACTLY ONE role assignment with a non-null
// college_id. Super Admin's own role assignment is global (college_id IS
// NULL, per schema.sql's user_roles design), so resolveActiveCollegeId
// ALWAYS returns null for a Super Admin. By the time this function runs
// (after requirePermission('analytics.view') has already passed),
// activeCollegeId === null reliably means "this caller holds a GLOBAL
// analytics.view grant" — which, per schema.sql's seed, only Super Admin
// has (Faculty's grant is college-scoped, tied to their own
// college-specific user_roles row). A non-null activeCollegeId that
// doesn't match the batch's own college means a Faculty member from a
// DIFFERENT college is trying to read a batch they hold no grant over.
//
// This check is NOT something that "falls out of existing infra for
// free" the way question-bank.routes.ts's own comment describes for
// questions.manage — that precedent covers resources whose OWN
// college_id was set to the creator's own scope AT CREATION time (so the
// permission cache's per-college resolution already lines up with the
// resource). This is different: batchId is an arbitrary path param that
// could name a batch in ANY college, and requirePermission('analytics.view')
// only verifies "does this caller hold analytics.view for THEIR OWN
// active college" — never "does this specific batchId belong to that
// same college." That's exactly the gap this function closes.
async function assertCanAccessBatch(
  batchId: string,
  activeCollegeId: string | null,
): Promise<void> {
  const batch = await organizationService.findBatchById(batchId);
  const trainingProgram = await organizationService.findTrainingProgramById(
    batch.trainingProgramId,
  );

  if (activeCollegeId !== null && trainingProgram.collegeId !== activeCollegeId) {
    throw new ForbiddenError('You are not authorized to view analytics for this batch');
  }
}

function isQualifiable(status: AssessmentAttemptStatus | null): boolean {
  return status !== null && QUALIFIABLE_STATUSES.includes(status);
}

// Reduces one student's (possibly several, across retakes) attempt rows
// down to a single classified row. See analytics.types.ts's
// PerStudentStatus for what each value means.
function classifyStudent(
  studentId: string,
  fullName: string,
  attempts: BatchAttemptRow[],
  effectiveThreshold: (attemptId: string) => number,
): PerStudentPerformanceRow {
  const real = attempts.filter(
    (attempt): attempt is BatchAttemptRow & { attemptId: string; status: AssessmentAttemptStatus } =>
      attempt.attemptId !== null && attempt.status !== null,
  );

  if (real.length === 0) {
    return { studentId, fullName, attemptId: null, totalScore: null, status: 'not_attempted' };
  }

  const qualifiable = real.filter((attempt) => isQualifiable(attempt.status));
  if (qualifiable.length > 0) {
    const best = qualifiable.reduce((current, candidate) =>
      Number(candidate.totalScore ?? 0) > Number(current.totalScore ?? 0) ? candidate : current,
    );
    const passed = Number(best.totalScore ?? 0) >= effectiveThreshold(best.attemptId);
    return {
      studentId,
      fullName,
      attemptId: best.attemptId,
      totalScore: best.totalScore,
      status: passed ? 'passed' : 'failed',
    };
  }

  const [chosen] = [...real].sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status],
  );
  const status: PerStudentStatus =
    chosen.status === 'pending_evaluation'
      ? 'pending_evaluation'
      : chosen.status === 'invalidated'
        ? 'invalidated'
        : 'in_progress';

  return {
    studentId,
    fullName,
    attemptId: chosen.attemptId,
    // An invalidated attempt's score is never shown — tainted, not a
    // legitimate result either way.
    totalScore: status === 'invalidated' ? null : chosen.totalScore,
    status,
  };
}

function groupByStudent(
  rows: BatchAttemptRow[],
): Map<string, { fullName: string; attempts: BatchAttemptRow[] }> {
  const grouped = new Map<string, { fullName: string; attempts: BatchAttemptRow[] }>();
  for (const row of rows) {
    const existing = grouped.get(row.studentId);
    if (existing) {
      existing.attempts.push(row);
    } else {
      grouped.set(row.studentId, { fullName: row.fullName, attempts: [row] });
    }
  }
  return grouped;
}

function computeMedian(sortedAscending: number[]): number {
  const mid = Math.floor(sortedAscending.length / 2);
  return sortedAscending.length % 2 !== 0
    ? sortedAscending[mid]
    : (sortedAscending[mid - 1] + sortedAscending[mid]) / 2;
}

// --- Live query vs caching (item 4) ---
//
// Live DB query every time, no Redis. Bounded scope is the whole
// reasoning: this aggregates over ONE batch's active students (schema.sql's
// batches.max_students suggests batches are meant to be a bounded,
// class-sized cohort, not a platform-wide scan), so computing the
// aggregates (average/pass-rate/distribution) in application code over
// the FULL result set is cheap regardless — no need to push that into
// more complex SQL-side aggregation for a dataset this size, and no need
// to cache a query this cheap. The per-student ROWS returned to the
// client ARE still paginated below, for the same response-size-hygiene
// and consistency-with-every-other-list-endpoint reasons as elsewhere in
// this codebase, not because the underlying query itself is expensive.
async function getBatchPerformance(
  batchId: string,
  query: GetBatchPerformanceQuery,
  activeCollegeId: string | null,
): Promise<BatchPerformanceSummary> {
  await assertCanAccessBatch(batchId, activeCollegeId);

  // Default assessment (item 1's "or across all assessments if none
  // specified"): the batch's MOST RECENTLY ACTIVE assessment, not a
  // pooled average across every assessment the batch has ever attempted.
  // Different assessments can have wildly different total possible
  // marks, so averaging raw totalScore values across them would mix
  // incompatible scales into one misleading number; picking one concrete
  // assessment (the most recent) keeps every computation below internally
  // consistent instead. If you actually want a literal
  // all-assessments-pooled view (accepting that scale-mismatch caveat),
  // that's a different, explicit design — say so and I'll build it
  // separately rather than silently guessing which one you meant.
  const assessmentId =
    query.assessmentId ?? (await analyticsRepository.findMostRecentAssessmentIdForBatch(batchId));
  if (!assessmentId) {
    throw new NotFoundError('This batch has no attempts on any assessment yet');
  }

  const assessment = await assessmentsService.findAssessmentById(assessmentId);

  const [rows, thresholdInfo] = await Promise.all([
    analyticsRepository.listBatchAttemptsForAssessment(batchId, assessmentId),
    analyticsRepository.findAssessmentSectionsThresholdInfo(assessmentId),
  ]);

  const hasExplicitThreshold =
    thresholdInfo.sectionCount > 0 && thresholdInfo.sectionCount === thresholdInfo.sectionsWithThreshold;
  const explicitThreshold = hasExplicitThreshold ? Number(thresholdInfo.sumThreshold) : null;

  const attemptIds = rows
    .filter((row): row is BatchAttemptRow & { attemptId: string } => row.attemptId !== null)
    .map((row) => row.attemptId);
  const possibleMarksRows = hasExplicitThreshold
    ? []
    : await analyticsRepository.sumPossibleMarksForAttempts(attemptIds);
  const possibleMarksByAttempt = new Map(
    possibleMarksRows.map((row) => [row.attemptId, Number(row.totalPossibleMarks)]),
  );

  function effectiveThreshold(attemptId: string): number {
    if (explicitThreshold !== null) {
      return explicitThreshold;
    }
    const possible = possibleMarksByAttempt.get(attemptId) ?? 0;
    return possible * FALLBACK_PASS_PERCENTAGE;
  }

  const grouped = groupByStudent(rows);
  const allStudentRows: PerStudentPerformanceRow[] = [];
  for (const [studentId, group] of grouped) {
    allStudentRows.push(classifyStudent(studentId, group.fullName, group.attempts, effectiveThreshold));
  }

  const qualifying = allStudentRows.filter(
    (row) => row.status === 'passed' || row.status === 'failed',
  );
  const scores = qualifying.map((row) => Number(row.totalScore ?? 0));
  const averageScore =
    scores.length > 0 ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2) : null;
  const passRate =
    qualifying.length > 0
      ? qualifying.filter((row) => row.status === 'passed').length / qualifying.length
      : null;

  const sortedScores = [...scores].sort((a, b) => a - b);
  const scoreDistribution: ScoreDistribution = {
    min: sortedScores.length > 0 ? sortedScores[0].toFixed(2) : null,
    max: sortedScores.length > 0 ? sortedScores[sortedScores.length - 1].toFixed(2) : null,
    median: sortedScores.length > 0 ? computeMedian(sortedScores).toFixed(2) : null,
  };

  const passingThreshold: PassingThresholdInfo = {
    source: hasExplicitThreshold ? 'sections' : 'fallback_percentage',
    absoluteThreshold: hasExplicitThreshold ? String(explicitThreshold) : null,
    fallbackPercentage: hasExplicitThreshold ? null : FALLBACK_PASS_PERCENTAGE,
  };

  const sortedStudents = [...allStudentRows].sort((a, b) => a.fullName.localeCompare(b.fullName));
  const offset = (query.page - 1) * query.pageSize;
  const pagedStudents = sortedStudents.slice(offset, offset + query.pageSize);

  return {
    batchId,
    assessmentId,
    assessmentTitle: assessment.title,
    passingThreshold,
    totalStudents: allStudentRows.length,
    studentsAttempted: allStudentRows.filter((row) => row.status !== 'not_attempted').length,
    averageScore,
    passRate,
    scoreDistribution,
    students: pagedStudents,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export const analyticsService = {
  getBatchPerformance,
};
