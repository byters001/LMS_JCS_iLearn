import { analyticsService } from '../analytics/analytics.service';
import { studentsService } from '../students/students.service';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error';
import {
  reportsRepository,
  type AttemptQuestionBreakdownRow,
  type AttemptSummaryRow,
} from './reports.repository';
import type { AttemptIdParams, ListMyAttemptsQuery } from './reports.schema';
import type {
  AttemptQuestionBreakdown,
  LeaderboardEntry,
  LeaderboardResult,
  LeaderboardTier,
  ListMyAttemptsResult,
  MyAttemptDetail,
  MyAttemptSummary,
} from './reports.types';

// --- Access (item 3) ---
//
// Self-only, same precedent as attempts.service.ts — confirmed this is
// still the right call rather than assumed: CLAUDE.md's "reports and
// analytics may query across module boundaries" exception is about DATA
// ACCESS PATTERNS (which tables a repository is allowed to JOIN across),
// not a statement that every reports endpoint is staff-only. Nothing
// about "my own attempt history" changes the fact that only students
// hold assessment_attempts rows at all — attempts.student_id references
// student_profiles(id), not users(id) directly, so a staff account
// simply has no rows to report on here in the first place. Self-scoping
// is the entire access model for THIS endpoint, exactly as it is for
// attempts itself; a hypothetical staff-facing "everyone's attempts"
// report would be a different endpoint with a different (permission-
// gated) design, not something this phase builds.
//
// No permission key: resolves the caller's JWT user id to their
// student_profiles row via studentsService.findStudentProfileByUserId (a
// cross-module SERVICE call — used here even though reports is allowed
// to query across module boundaries directly, because that allowance is
// about aggregation queries, not a reason to bypass an already-correct
// identity-resolution service function). A caller with no student_profiles
// row is rejected here — the same structural gate attempts.service.ts
// already uses, not a new pattern invented for this module.
async function requireStudentProfileId(userId: string): Promise<string> {
  const studentProfile = await studentsService.findStudentProfileByUserId(userId);
  if (!studentProfile) {
    throw new ForbiddenError('Only students have an attempt history to report on');
  }
  return studentProfile.id;
}

function toMyAttemptSummary(row: AttemptSummaryRow, scorePercent: number | null): MyAttemptSummary {
  const { studentId: _studentId, ...summary } = row;
  return { ...summary, scorePercent };
}

// Performance-page %-change phase — reuses analyticsService's existing
// getScorePercentagesForAttempts (already built and in production use for
// getLeaderboard below), NOT a new/duplicated max-possible-marks query.
// Confirmed by reading analytics.service.ts/analytics.repository.ts
// directly before writing this: getScorePercentagesForAttempts already
// sums question_versions.marks across an attempt's frozen question set via
// one batched, GROUP-BY query (sumPossibleMarksForAttempts) — building a
// second, separate implementation of the same computation here would have
// been exactly the kind of duplicated business logic this codebase
// consistently avoids. ONE call for the whole page of rows (or the single
// row getMyAttemptDetail passes), never per-row — the N+1 pattern
// PerformanceAnalyticsSection.tsx's own comment already documented as
// deliberately avoided for this exact endpoint.
//
// Attempts with a null totalScore (not yet graded) are excluded from the
// analyticsService call entirely — there's no score to compute a
// percentage FROM yet — and simply end up with scorePercent: null via the
// `?? null` fallback below, same as an attempt whose possible marks
// resolved to zero (analyticsService's own "possible <= 0 -> omit from
// results" rule, not duplicated here either).
async function attachScorePercents(rows: AttemptSummaryRow[]): Promise<MyAttemptSummary[]> {
  const scored = rows
    .filter((row): row is AttemptSummaryRow & { totalScore: string } => row.totalScore !== null)
    .map((row) => ({ attemptId: row.id, totalScore: row.totalScore }));
  const percentages = await analyticsService.getScorePercentagesForAttempts(scored);
  const percentByAttempt = new Map(percentages.map((p) => [p.attemptId, p.scorePercent]));

  return rows.map((row) => {
    const rawPercent = percentByAttempt.get(row.id);
    // Rounded to one decimal place for display — the leaderboard's own
    // averaging (below) deliberately keeps full precision pre-average, but
    // this is a per-attempt number shown directly in a table, not an
    // intermediate value feeding a further calculation.
    const scorePercent = rawPercent === undefined ? null : Math.round(rawPercent * 10) / 10;
    return toMyAttemptSummary(row, scorePercent);
  });
}

// --- Caching (item 4) ---
//
// Live DB query every time — no Redis, no cache layer. This is a
// low-frequency, per-student read (a student checks their own history
// occasionally; nothing suggests this is hit anywhere near the
// permission-cache/rate-limit/idempotency-check frequency that actually
// justified Redis elsewhere in this codebase). The underlying data also
// changes on every submitResponse/submitCode/submitAttempt call, so
// caching it would need real invalidation wiring for a read that isn't
// demonstrated to be hot — premature optimization for a cost (cache
// invalidation correctness) that isn't justified by any observed load.
// If this endpoint turns out to be hit at real volume later, add caching
// then, against actual numbers — not speculatively now.

async function listMyAttempts(
  userId: string,
  query: ListMyAttemptsQuery,
): Promise<ListMyAttemptsResult> {
  const studentId = await requireStudentProfileId(userId);
  const { items, total } = await reportsRepository.listMyAttempts({
    studentId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items: await attachScorePercents(items), total, page: query.page, pageSize: query.pageSize };
}

async function getMyAttemptDetail(
  userId: string,
  attemptId: AttemptIdParams['attemptId'],
): Promise<MyAttemptDetail> {
  const studentId = await requireStudentProfileId(userId);

  const summaryRow = await reportsRepository.findAttemptSummaryById(attemptId);
  if (!summaryRow) {
    throw new NotFoundError('Attempt not found');
  }
  if (summaryRow.studentId !== studentId) {
    throw new ForbiddenError('You can only view your own attempt reports');
  }

  const breakdownRows = await reportsRepository.listAttemptQuestionBreakdown(attemptId);
  const questions = await Promise.all(breakdownRows.map(buildQuestionBreakdown));

  const [attempt] = await attachScorePercents([summaryRow]);
  return { attempt, questions };
}

// --- Sanitization (item 2) ---
//
// Deliberately a UNIFORM shape across mcq/coding/psychometric —
// questionText, marksPossible, marksObtained, isCorrect ONLY. This is a
// post-hoc score report, not a render-the-test payload, and matches
// exactly the four fields the task asked for. "It's my own attempt"
// does NOT automatically mean "show everything" — explicitly NOT
// included, even though this is the caller's own completed attempt:
//
//   - selectedOptionId, or the full MCQ option list with is_correct
//     exposed on every option — the report says whether YOUR answer was
//     correct and what you scored, not a full answer key. Exposing
//     is_correct per-option here would let a student use their own
//     "report" to farm correct answers for questions that remain live in
//     the question bank (and could reappear in a retake or a different
//     assessment) — the same abuse getAttemptQuestions' MCQ sanitization
//     already guards against DURING an attempt; that reasoning doesn't
//     expire just because the attempt is now over.
//   - psychometric_options.trait_weight — same reasoning
//     attempts.service.ts's buildRenderableQuestion already established:
//     revealing the scoring weight lets a respondent reverse-engineer the
//     trait model. That stays true after the fact too — a psychometric
//     instrument's validity depends on respondents never learning the
//     scoring key, not just not knowing it mid-attempt.
//   - hidden coding_test_cases' input/expected_output/points — "hidden
//     means hidden," unconditionally, own attempt or not. The one
//     coding-specific addition, latestCodingTestCases, exposes ONLY
//     aggregate pass/total counts from the student's most recent
//     coding_submissions row, never source_code/compile_error/
//     runtime_error/execution_output (any of which could indirectly
//     describe hidden test case content).
//   - That "latest submission" count is explicitly NOT guaranteed to
//     match the recorded marksObtained/isCorrect: "best result wins"
//     grading (attempts.service.ts's submitCode) means the recorded grade
//     may reflect an EARLIER, better submission than the latest one, and
//     there's no foreign key tracking which specific coding_submissions
//     row produced the currently-recorded grade. Rather than guess (and
//     risk showing a mismatched, misleading count), this is labeled
//     "latest" and kept clearly separate from the official
//     marksObtained/isCorrect fields.
async function buildQuestionBreakdown(
  row: AttemptQuestionBreakdownRow,
): Promise<AttemptQuestionBreakdown> {
  let latestCodingTestCases: { passed: number; total: number } | null = null;

  if (row.questionType === 'coding' && row.attemptResponseId) {
    const counts = await reportsRepository.findLatestCodingSubmissionCounts(
      row.attemptResponseId,
    );
    if (counts) {
      latestCodingTestCases = { passed: counts.testCasesPassed, total: counts.testCasesTotal };
    }
  }

  return {
    questionVersionId: row.questionVersionId,
    sortOrder: row.sortOrder,
    questionText: row.questionText,
    marksPossible: row.marksPossible,
    marksObtained: row.marksObtained,
    isCorrect: row.isCorrect,
    latestCodingTestCases,
  };
}

// --- Leaderboard (item 8B) ---
//
// Tiers are assigned by SCORE, not by rank position — a deliberate fix for
// a real edge case a live test surfaced: two students tied at the exact
// same average score % could land in different tiers under a purely
// rank-based scheme, purely because of an arbitrary secondary sort key
// (name). A tier is a reward/status badge shown to the user; letting an
// arbitrary tie-break (not performance) decide who gets the better badge
// isn't defensible, even though a differing numeric RANK for tied
// students is normal and stays unchanged below.
//
// Cumulative percentage cutoffs (not four independently-rounded slice
// sizes — see below) locate each tier BOUNDARY's rank position, then the
// SCORE at that rank becomes the threshold everyone is compared against:
// platinumThreshold = the score of whoever sits at the platinum cutoff
// rank, and so on. Any student whose score is >= a threshold gets that
// tier or better — so a student tied with the boundary score is pulled
// into the better tier along with them, rather than split across the
// boundary by name. This can (deliberately) make a tier's actual
// membership slightly exceed its nominal percentage when a tie straddles
// a cutoff — accepted, since the alternative is an arbitrary split.
//
// Computing the three bucket sizes as independent Math.ceil(n * pct)
// calls (rather than cumulative) would risk the slices not summing to n
// (rounding could leave a rank uncovered by any tier, or double-cover
// one) — cumulative cutoffs guarantee every rank from 1..n maps to
// exactly one boundary rank.
const TIER_CUMULATIVE_CUTOFFS: { tier: LeaderboardTier; cumulativePercent: number }[] = [
  { tier: 'platinum', cumulativePercent: 0.1 },
  { tier: 'gold', cumulativePercent: 0.35 },
  { tier: 'silver', cumulativePercent: 0.7 },
];

// scoresDescending must already be sorted highest-to-lowest — the same
// order studentAverages is sorted into below (score first, name as the
// tie-break) — so that "the score at cutoff rank R" means array index
// R - 1.
function tierThresholds(
  scoresDescending: number[],
): { tier: LeaderboardTier; thresholdScore: number }[] {
  const totalRanked = scoresDescending.length;
  return TIER_CUMULATIVE_CUTOFFS.map(({ tier, cumulativePercent }) => {
    const cutoffRank = Math.ceil(totalRanked * cumulativePercent);
    return { tier, thresholdScore: scoresDescending[cutoffRank - 1] };
  });
}

function tierForScore(
  score: number,
  thresholds: { tier: LeaderboardTier; thresholdScore: number }[],
): LeaderboardTier {
  for (const { tier, thresholdScore } of thresholds) {
    if (score >= thresholdScore) {
      return tier;
    }
  }
  return 'bronze';
}

// Strictly batch-scoped (item 8B) — resolves the CALLER's own active
// batch id(s) via studentsService.listActiveBatchIdsForStudent, the exact
// same lookup attempts.service.ts's assertBatchAuthorized already uses to
// answer "which batches is this student currently in," rather than
// accepting a batchId from the request and having to separately verify
// the caller belongs to it. There is no code path here that can name a
// batch the caller isn't enrolled in — never cross-batch, never global.
//
// A student can rarely be active in more than one batch at once (schema.sql
// permits it — same edge case listActiveBatchIdsForStudent's own comment
// flags); rather than arbitrarily picking just one, every batch the caller
// is actually in is pooled into one combined ranking. This still never
// shows a batch the caller ISN'T in, which is the actual guarantee item 8B
// asks for — it only affects the rare multi-batch student, and degrades to
// a single ordinary batch for everyone else.
//
// Scoring basis (already decided, not re-derived here): average % score
// across the student's own completed ('submitted') attempts, each attempt
// expressed as a percentage of ITS OWN total possible marks — reuses
// analyticsService.getScorePercentagesForAttempts (itself reusing
// analyticsRepository.sumPossibleMarksForAttempts) rather than duplicating
// that per-attempt-denominator math here. Raw totalScore points are never
// compared directly across students, for the same reason
// TrainerDetailPage.tsx's own trend chart and item 9's dashboard chart
// both already documented: different assessments carry different total
// possible marks, so raw points aren't comparable, only percentages are.
async function getLeaderboard(userId: string): Promise<LeaderboardResult> {
  const studentId = await requireStudentProfileId(userId);
  const batchIds = await studentsService.listActiveBatchIdsForStudent(studentId);

  if (batchIds.length === 0) {
    return { entries: [] };
  }

  const rows = await reportsRepository.listSubmittedAttemptsForBatches(batchIds);

  const attemptsByStudent = new Map<
    string,
    { fullName: string; attempts: { attemptId: string; totalScore: string }[] }
  >();
  for (const row of rows) {
    // Defensive only — see BatchSubmittedAttemptRow's own comment: a
    // 'submitted' row always has a non-null totalScore in practice.
    if (row.totalScore === null) continue;
    const existing = attemptsByStudent.get(row.studentId);
    const attempt = { attemptId: row.attemptId, totalScore: row.totalScore };
    if (existing) {
      existing.attempts.push(attempt);
    } else {
      attemptsByStudent.set(row.studentId, { fullName: row.fullName, attempts: [attempt] });
    }
  }

  const allAttempts = [...attemptsByStudent.values()].flatMap((group) => group.attempts);
  const percentages = await analyticsService.getScorePercentagesForAttempts(allAttempts);
  const percentByAttempt = new Map(percentages.map((p) => [p.attemptId, p.scorePercent]));

  const studentAverages: { studentId: string; fullName: string; averageScorePercent: number }[] = [];
  for (const [candidateStudentId, group] of attemptsByStudent) {
    const scores = group.attempts
      .map((attempt) => percentByAttempt.get(attempt.attemptId))
      .filter((score): score is number => score !== undefined);
    // Every one of this student's attempts had unresolvable (zero) total
    // possible marks — a degenerate case, excluded rather than averaged
    // in as a false 0%.
    if (scores.length === 0) continue;

    const averageScorePercent = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    studentAverages.push({ studentId: candidateStudentId, fullName: group.fullName, averageScorePercent });
  }

  // Ties broken alphabetically by name for a deterministic, strict 1..n
  // ranking (no joint/shared ranks) — same tie-break precedent
  // analytics.service.ts's getBatchPerformance already uses for its own
  // student ordering. This tie-break affects the numeric `rank` field
  // ONLY — tier is assigned by score (see tierThresholds/tierForScore
  // above), so it is NOT affected by which of two tied students happens
  // to sort first here.
  studentAverages.sort(
    (a, b) => b.averageScorePercent - a.averageScorePercent || a.fullName.localeCompare(b.fullName),
  );

  const thresholds = tierThresholds(studentAverages.map((student) => student.averageScorePercent));

  const entries: LeaderboardEntry[] = studentAverages.map((student, index) => {
    return {
      rank: index + 1,
      studentId: student.studentId,
      displayName: student.fullName,
      // Rank/tier are computed from the FULL-precision average (above) —
      // rounding only happens here, for display, so rounding can never
      // itself create or hide a score tie.
      averageScorePercent: Math.round(student.averageScorePercent * 100) / 100,
      tier: tierForScore(student.averageScorePercent, thresholds),
      isSelf: student.studentId === studentId,
    };
  });

  return { entries };
}

export const reportsService = {
  listMyAttempts,
  getMyAttemptDetail,
  getLeaderboard,
};
