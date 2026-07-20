import { MAX_PAGE_SIZE } from '../../config/constants';
import { assessmentsService } from '../assessments/assessments.service';
import { organizationService } from '../organization/organization.service';
import { userHasRole } from '../../rbac/role-assignments';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error';
import {
  analyticsRepository,
  type BatchAttemptRow,
} from './analytics.repository';
import type { GetBatchPerformanceQuery } from './analytics.schema';
import type {
  AttendanceByDateResult,
  AttemptScorePercentage,
  BatchAssessmentParticipationResult,
  BatchAssessmentParticipationRow,
  BatchPerformanceSummary,
  FailedStudentsBatchGroup,
  FailedStudentsResult,
  PassingThresholdInfo,
  PerStudentPerformanceRow,
  PerStudentStatus,
  ScoreDistribution,
  TrainerPerformanceTrendPoint,
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

// --- Batch access scoping (item 3, tightened by item 6's follow-up) ---
//
// Previously checked only "does this batch's college match the caller's
// activeCollegeId" — coarser than the real access model: a Faculty member
// could view performance analytics for ANY batch in their own college,
// not just batches they're actually assigned to train (batch_trainers).
// That check also silently BYPASSED entirely whenever activeCollegeId was
// null — which auth.service.ts's resolveActiveCollegeId returns not only
// for a genuine Super Admin, but for ANY user holding more than one role
// assignment, faculty included. A faculty member assigned to multiple
// colleges got the exact same unrestricted access as Super Admin, as a
// side effect of that collapse, not by design.
//
// Fixed to the same pattern assessments.service.ts's
// resolveAssessmentListBatchScope and question-bank.service.ts's
// resolveQuestionListCollegeScope already use: userHasRole queried fresh
// against user_roles (never activeCollegeId, never permissionCache — see
// rbac/role-assignments.ts's userHasRole for why neither can answer "is
// THIS caller super_admin") decides the bypass; everyone else is checked
// against organizationService.listBatchAssignmentsForTrainers([userId]),
// the real batch_trainers-backed assignment list, for this SPECIFIC
// batchId — not merely "same college." This also structurally closes the
// activeCollegeId-null bypass: the new check never reads activeCollegeId
// at all, so there is no null case left to accidentally skip past.
async function assertCanAccessBatch(batchId: string, userId: string): Promise<void> {
  const isSuperAdmin = await userHasRole(userId, 'super_admin');
  if (isSuperAdmin) {
    return;
  }

  const trainerBatchAssignments = await organizationService.listBatchAssignmentsForTrainers([
    userId,
  ]);
  const isAssignedToBatch = trainerBatchAssignments.some(
    (assignment) => assignment.batchId === batchId,
  );

  if (!isAssignedToBatch) {
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
  userId: string,
): Promise<BatchPerformanceSummary> {
  await assertCanAccessBatch(batchId, userId);

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

// --- Batch assessment participation (item 10 part 1) ---
//
// Module ownership: analytics, not trainers — this is cross-cutting
// aggregation over assessments/attempts/students for ONE batch (exactly
// getBatchPerformance's own shape of problem, just one level up: "which
// assessment" instead of "which student"), and CLAUDE.md carves analytics
// out as the explicit exception allowed to query across module
// boundaries for exactly this reason. trainers.service.ts's Phase 5
// getTrainerPerformance is the precedent for HOW a Faculty-facing feature
// should compose this, not WHERE the aggregation itself lives — that
// function doesn't compute anything itself, it resolves which batches a
// trainer owns (organizationService) and then calls INTO
// analyticsService.getTrainerPerformanceTrend for the actual numbers. This
// function is that same "analytics does the aggregation" role for item
// 10 — MyBatchesPage calls it directly for one already-known batchId
// (the trainer picked it from their own /batches/mine list), so there's
// no separate trainers.service.ts wrapper needed the way Phase 5's
// multi-batch trainer dashboard needed one.
//
// Reuses assertCanAccessBatch as-is (same batch_trainers-assignment /
// Super-Admin-unrestricted scoping getBatchPerformance already enforces)
// — no separate authorization concept invented for this endpoint.
async function getBatchAssessmentParticipation(
  batchId: string,
  userId: string,
): Promise<BatchAssessmentParticipationResult> {
  await assertCanAccessBatch(batchId, userId);
  const batch = await organizationService.findBatchById(batchId);

  const [assessmentRows, studentIds] = await Promise.all([
    analyticsRepository.listAssessmentsAssignedToBatch(batchId),
    analyticsRepository.listActiveStudentIdsForBatch(batchId),
  ]);

  const attemptedCounts = await analyticsRepository.countAttemptedStudentsByAssessment(
    assessmentRows.map((row) => row.assessmentId),
    studentIds,
  );
  const attemptedByAssessment = new Map(
    attemptedCounts.map((row) => [row.assessmentId, Number(row.attemptedCount)]),
  );

  const totalStudents = studentIds.length;
  const assessments: BatchAssessmentParticipationRow[] = assessmentRows.map((row) => {
    const studentsAttempted = attemptedByAssessment.get(row.assessmentId) ?? 0;
    return {
      assessmentId: row.assessmentId,
      assessmentTitle: row.title,
      status: row.status,
      testCategory: row.testCategory,
      startAt: row.startAt ? row.startAt.toISOString() : null,
      endAt: row.endAt ? row.endAt.toISOString() : null,
      studentsAttempted,
      totalStudents,
      participationRate: totalStudents > 0 ? studentsAttempted / totalStudents : null,
    };
  });

  return { batchId, batchName: batch.name, totalStudents, assessments };
}

// --- Trainer performance trend (Phase 5) ---
//
// Reuses getBatchPerformance as-is, once per (batchId, assessmentId) pair
// — zero duplication of the average-score/pass-rate math, threshold
// resolution, or classifyStudent/groupByStudent reduction above; this
// function is purely orchestration (enumerate which assessments each
// batch has activity on, call the existing summary function for each,
// flatten into one chronological list).
//
// userId is now threaded through as the REAL acting caller (item 6
// follow-up) rather than the old hardcoded-null bypass this used to pass
// to skip assertCanAccessBatch's check entirely. That bypass is no longer
// needed to make this reuse work: this function is only ever reachable via
// trainers.service.ts's getTrainerPerformance, itself gated by
// trainers.routes.ts's Super-Admin-only 'trainers.view' permission — so
// the real caller genuinely IS super_admin every time this runs, and
// assertCanAccessBatch's own userHasRole bypass now verifies that for
// real, instead of a magic sentinel value asserting it by convention. A
// trainer's assigned batches can legitimately span multiple colleges
// regardless, which was the other reason this used to skip a
// college-based check — moot now that the check is batch_trainers-based,
// not college-based, but noted for context.
//
// pageSize: 1 on each call — only the summary fields (averageScore,
// passRate, totalStudents, studentsAttempted, assessmentTitle) are used
// below; the paginated per-student `students` array getBatchPerformance
// also computes/returns is discarded. The underlying aggregates are
// always computed over the FULL batch regardless of page/pageSize (see
// getBatchPerformance's own "Live query vs caching" comment) — pageSize
// only bounds the per-student list's payload size, not correctness.
async function getTrainerPerformanceTrend(
  batchIds: string[],
  userId: string,
): Promise<TrainerPerformanceTrendPoint[]> {
  const activityByBatch = await Promise.all(
    batchIds.map(async (batchId) => ({
      batchId,
      activity: await analyticsRepository.listAssessmentActivityForBatch(batchId),
    })),
  );

  const pairs = activityByBatch.flatMap(({ batchId, activity }) =>
    activity.map((entry) => ({ batchId, ...entry })),
  );

  const trend = await Promise.all(
    pairs.map(async ({ batchId, assessmentId, mostRecentAttemptAt }) => {
      const summary = await getBatchPerformance(
        batchId,
        { assessmentId, page: 1, pageSize: 1 },
        userId,
      );
      const point: TrainerPerformanceTrendPoint = {
        batchId,
        assessmentId,
        assessmentTitle: summary.assessmentTitle,
        attemptedAt: mostRecentAttemptAt.toISOString(),
        averageScore: summary.averageScore,
        passRate: summary.passRate,
        totalStudents: summary.totalStudents,
        studentsAttempted: summary.studentsAttempted,
      };
      return point;
    }),
  );

  return trend.sort((a, b) => a.attemptedAt.localeCompare(b.attemptedAt));
}

// --- Attendance-by-date (Phase 6a chatbot tool) ---
//
// See analytics.repository.ts's listTrainingSessionsOnDate for the full
// "no attendance table exists" design-decision comment — this reports
// which training sessions were scheduled/held on `date`, not per-student
// physical presence.
//
// College scoping mirrors organization.service.ts's listBatches exactly:
// a Faculty caller (activeCollegeId !== null) may only ever see their own
// college — an explicit, different collegeId is rejected outright, not
// silently narrowed. Unlike listBatches (where collegeId is a REQUIRED
// query param), collegeId is optional here — a Faculty caller who omits
// it gets their own college's sessions by default (never "all colleges,"
// which they hold no grant over anyway); a Super Admin who omits it sees
// every college's sessions on that date, unscoped, since collegeId ===
// null already means a global grant everywhere else in this codebase.
async function getAttendanceByDate(
  date: string,
  collegeId: string | undefined,
  activeCollegeId: string | null,
): Promise<AttendanceByDateResult> {
  let effectiveCollegeId = collegeId;

  if (activeCollegeId !== null) {
    if (collegeId !== undefined && collegeId !== activeCollegeId) {
      throw new ForbiddenError('You are not authorized to view attendance for this college');
    }
    effectiveCollegeId = activeCollegeId;
  }

  const sessions = await analyticsRepository.listTrainingSessionsOnDate(date, effectiveCollegeId);

  return {
    date,
    collegeId: effectiveCollegeId ?? null,
    sessions,
    totalSessions: sessions.length,
    completedSessions: sessions.filter((session) => session.status === 'completed').length,
  };
}

// --- Failed students (Phase 6a chatbot tool) ---
//
// Reuses getBatchPerformance verbatim, once per resolved batch — zero
// duplication of the pass/fail classification or threshold-resolution
// logic above (same reuse shape as getTrainerPerformanceTrend). When
// batchId is omitted, candidate batches come from
// assessmentsService.listAssessmentBatches (an existing cross-module
// SERVICE call, not a fresh query against assessment_batches here).
//
// A batch the caller isn't assigned to (ForbiddenError from
// getBatchPerformance's own assertCanAccessBatch) or with zero attempts
// yet on this assessment (NotFoundError) is SKIPPED, not a hard failure
// for the whole request — "give me what you're allowed to see and what
// actually has data," matching this function's inherently multi-batch
// scope. Contrast with getBatchPerformance's own single-batch caller,
// where either of those IS a hard failure, because there the caller named
// exactly one specific batch they don't have access to / has no data.
async function getFailedStudents(
  assessmentId: string,
  batchId: string | undefined,
  userId: string,
): Promise<FailedStudentsResult> {
  const assessment = await assessmentsService.findAssessmentById(assessmentId);

  const candidateBatchIds = batchId
    ? [batchId]
    : await assessmentsService.listAssessmentBatches(assessmentId);

  if (candidateBatchIds.length === 0) {
    throw new NotFoundError('This assessment has no batches assigned');
  }

  const batches: FailedStudentsBatchGroup[] = [];
  for (const candidateBatchId of candidateBatchIds) {
    let summary: BatchPerformanceSummary;
    try {
      // pageSize: MAX_PAGE_SIZE (100) — getBatchPerformance's own
      // `students` array is paginated (see that function's module
      // comment: aggregates are computed over the full batch, but the
      // returned list is capped). A batch with MORE than 100 active
      // students would have its overflow silently excluded from this
      // failed-students list on page 1 — a stated, accepted limitation
      // for this phase (matches batches.max_students' own implied
      // "class-sized cohort" scale this codebase already assumes
      // elsewhere), not a silently-introduced correctness gap.
      summary = await getBatchPerformance(
        candidateBatchId,
        { assessmentId, page: 1, pageSize: MAX_PAGE_SIZE },
        userId,
      );
    } catch (err) {
      if (err instanceof ForbiddenError || err instanceof NotFoundError) {
        continue;
      }
      throw err;
    }

    const failedStudents = summary.students.filter((row) => row.status === 'failed');
    if (failedStudents.length > 0) {
      const batch = await organizationService.findBatchById(candidateBatchId);
      batches.push({ batchId: candidateBatchId, batchName: batch.name, students: failedStudents });
    }
  }

  return {
    assessmentId,
    assessmentTitle: assessment.title,
    batches,
    totalFailedStudents: batches.reduce((sum, group) => sum + group.students.length, 0),
  };
}

// --- Score percentages (item 8B, student leaderboard) ---
//
// Reuses analyticsRepository.sumPossibleMarksForAttempts as-is — the SAME
// per-attempt total-possible-marks query getBatchPerformance already
// depends on (see that repository function's own comment: a pool-based
// section's frozen selections can draw a different question set, and
// therefore a different total possible marks, on every attempt, so this
// has to be resolved per-attempt, never assumed from the assessment
// definition). Exported here — rather than left as getBatchPerformance-
// internal plumbing — specifically so reports.service.ts's getLeaderboard
// can call it as a cross-module SERVICE function (CLAUDE.md's boundary
// rule: a module may call another module's service, never its
// repository), instead of re-deriving this same SQL aggregation itself.
//
// A zero (or unresolvable) totalPossibleMarks is EXCLUDED from the
// result, not returned as a 0% or Infinity — there is no meaningful
// percentage for an attempt with no possible marks, and silently treating
// it as 0% would drag down an average with a value that isn't a real
// score. Callers (currently just reports.service.ts) decide what to do
// with an attempt that doesn't come back at all.
async function getScorePercentagesForAttempts(
  attempts: { attemptId: string; totalScore: string }[],
): Promise<AttemptScorePercentage[]> {
  if (attempts.length === 0) {
    return [];
  }

  const possibleMarksRows = await analyticsRepository.sumPossibleMarksForAttempts(
    attempts.map((attempt) => attempt.attemptId),
  );
  const possibleByAttempt = new Map(
    possibleMarksRows.map((row) => [row.attemptId, Number(row.totalPossibleMarks)]),
  );

  const results: AttemptScorePercentage[] = [];
  for (const attempt of attempts) {
    const possible = possibleByAttempt.get(attempt.attemptId) ?? 0;
    if (possible <= 0) continue;
    results.push({
      attemptId: attempt.attemptId,
      scorePercent: (Number(attempt.totalScore) / possible) * 100,
    });
  }
  return results;
}

export const analyticsService = {
  getBatchPerformance,
  getBatchAssessmentParticipation,
  getTrainerPerformanceTrend,
  getAttendanceByDate,
  getFailedStudents,
  getScorePercentagesForAttempts,
};
