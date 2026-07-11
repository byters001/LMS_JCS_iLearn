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

function toMyAttemptSummary(row: AttemptSummaryRow): MyAttemptSummary {
  const { studentId: _studentId, ...summary } = row;
  return summary;
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
  return { items: items.map(toMyAttemptSummary), total, page: query.page, pageSize: query.pageSize };
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

  return { attempt: toMyAttemptSummary(summaryRow), questions };
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

export const reportsService = {
  listMyAttempts,
  getMyAttemptDetail,
};
