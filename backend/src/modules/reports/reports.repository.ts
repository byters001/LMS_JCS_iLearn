import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessments } from '../../db/schema/assessments.schema';
import {
  assessmentAttempts,
  attemptQuestionSelections,
  attemptResponses,
} from '../../db/schema/attempts.schema';
import { codingSubmissions } from '../../db/schema/coding.schema';
import { users } from '../../db/schema/identity.schema';
import { questionVersions, questions } from '../../db/schema/question-bank.schema';
import { studentProfiles, trainingProgramStudents } from '../../db/schema/students.schema';
import type { Assessment, AssessmentAttempt } from '../../db/types';

// reports is CLAUDE.md's explicit cross-module-QUERY exception ("their
// whole purpose is cross-cutting aggregation") — every query below joins
// directly across assessments/attempts/question-bank/coding's own tables,
// something no other module is allowed to do (they must go through a
// cross-module SERVICE call instead). Nothing here writes anything —
// read-only, matching this phase's stated scope.

// Includes studentId (NOT part of the public MyAttemptSummary type) so
// reports.service.ts can verify ownership on the single-attempt fetch
// before stripping it from the response — the same
// fetch-then-compare-then-strip shape attempts.service.ts's
// assertOwnsAttempt already uses, not a new pattern.
export interface AttemptSummaryRow {
  id: string;
  assessmentId: string;
  studentId: string;
  assessmentTitle: string;
  testCategory: Assessment['testCategory'];
  status: AssessmentAttempt['status'];
  attemptNumber: number;
  isRetake: boolean;
  totalScore: string | null;
  submissionTime: Date | null;
  createdAt: Date;
}

const attemptSummaryColumns = {
  id: assessmentAttempts.id,
  assessmentId: assessmentAttempts.assessmentId,
  studentId: assessmentAttempts.studentId,
  assessmentTitle: assessments.title,
  testCategory: assessments.testCategory,
  status: assessmentAttempts.status,
  attemptNumber: assessmentAttempts.attemptNumber,
  isRetake: assessmentAttempts.isRetake,
  totalScore: assessmentAttempts.totalScore,
  submissionTime: assessmentAttempts.submissionTime,
  createdAt: assessmentAttempts.createdAt,
};

export interface ListMyAttemptsParams {
  studentId: string;
  page: number;
  pageSize: number;
}

export interface ListMyAttemptsResult {
  items: AttemptSummaryRow[];
  total: number;
}

async function listMyAttempts(params: ListMyAttemptsParams): Promise<ListMyAttemptsResult> {
  const { studentId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = eq(assessmentAttempts.studentId, studentId);

  const [items, totalRows] = await Promise.all([
    db
      .select(attemptSummaryColumns)
      .from(assessmentAttempts)
      .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
      .where(where)
      .orderBy(desc(assessmentAttempts.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(assessmentAttempts).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

// No studentId filter here — ownership is checked in the SERVICE layer
// (compare .studentId, throw ForbiddenError if it doesn't match), the
// same fetch-without-filtering-then-compare shape attempts.service.ts's
// findAttemptOr404 + assertOwnsAttempt already establishes, so "attempt
// doesn't exist" (404) and "attempt exists but isn't yours" (403) stay
// distinguishable instead of collapsing into one silent 404.
async function findAttemptSummaryById(attemptId: string): Promise<AttemptSummaryRow | undefined> {
  const [row] = await db
    .select(attemptSummaryColumns)
    .from(assessmentAttempts)
    .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
    .where(eq(assessmentAttempts.id, attemptId))
    .limit(1);
  return row;
}

// Per-question breakdown source: attempt_question_selections (the FROZEN
// list — reused directly, never re-resolved live, same discipline
// attempts.service.ts's getAttemptQuestions already established) joined
// to question_versions for display text/marks, questions for type, and
// LEFT JOINed to attempt_responses for whatever grade currently exists
// (NULL for an unanswered question — a LEFT JOIN, not an INNER JOIN, is
// what makes that possible). attemptResponseId is carried through only so
// the service can look up a coding question's latest submission counts;
// it is NOT part of the public API shape.
export interface AttemptQuestionBreakdownRow {
  questionVersionId: string;
  sortOrder: number;
  questionText: string;
  marksPossible: string;
  marksObtained: string | null;
  isCorrect: boolean | null;
  questionType: 'mcq' | 'coding' | 'psychometric';
  attemptResponseId: string | null;
}

async function listAttemptQuestionBreakdown(
  attemptId: string,
): Promise<AttemptQuestionBreakdownRow[]> {
  return db
    .select({
      questionVersionId: attemptQuestionSelections.questionVersionId,
      sortOrder: attemptQuestionSelections.sortOrder,
      questionText: questionVersions.questionText,
      marksPossible: questionVersions.marks,
      marksObtained: attemptResponses.marksObtained,
      isCorrect: attemptResponses.isCorrect,
      questionType: questions.type,
      attemptResponseId: attemptResponses.id,
    })
    .from(attemptQuestionSelections)
    .innerJoin(
      questionVersions,
      eq(questionVersions.id, attemptQuestionSelections.questionVersionId),
    )
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .leftJoin(
      attemptResponses,
      and(
        eq(attemptResponses.attemptId, attemptQuestionSelections.attemptId),
        eq(attemptResponses.questionVersionId, attemptQuestionSelections.questionVersionId),
      ),
    )
    .where(eq(attemptQuestionSelections.attemptId, attemptId))
    .orderBy(asc(attemptQuestionSelections.sortOrder));
}

export interface LatestCodingSubmissionCounts {
  testCasesPassed: number;
  testCasesTotal: number;
}

// Only ever called for a coding-type row with a non-null
// attemptResponseId (see reports.service.ts's buildQuestionBreakdown) —
// returns aggregate pass/total counts ONLY, never source_code/
// compile_error/runtime_error/execution_output (any of which could
// indirectly describe hidden test case content).
async function findLatestCodingSubmissionCounts(
  attemptResponseId: string,
): Promise<LatestCodingSubmissionCounts | undefined> {
  const [row] = await db
    .select({
      testCasesPassed: codingSubmissions.testCasesPassed,
      testCasesTotal: codingSubmissions.testCasesTotal,
    })
    .from(codingSubmissions)
    .where(eq(codingSubmissions.attemptResponseId, attemptResponseId))
    .orderBy(desc(codingSubmissions.submittedAt))
    .limit(1);
  return row;
}

// --- Leaderboard (item 8B) ---
//
// One row per (active batch student, submitted attempt) — an INNER join
// throughout, deliberately unlike listMyAttempts/listBatchAttemptsForAssessment's
// own LEFT JOIN precedent (analytics.repository.ts): a student with zero
// submitted attempts should not appear in this result AT ALL, so the
// leaderboard's "only students with at least 1 completed attempt"
// requirement (item 8B) falls straight out of the join itself rather than
// needing a separate filter step afterward.
export interface BatchSubmittedAttemptRow {
  studentId: string;
  fullName: string;
  attemptId: string;
  // Always non-null in practice for a 'submitted' row (attempts.service.ts's
  // submitAttempt always writes totalScore in the same call that sets
  // status to 'submitted' — see finalizeAttempt) — typed nullable here only
  // because the underlying column itself is nullable; reports.service.ts's
  // getLeaderboard still guards against null defensively rather than
  // asserting it away.
  totalScore: string | null;
}

async function listSubmittedAttemptsForBatches(
  batchIds: string[],
): Promise<BatchSubmittedAttemptRow[]> {
  if (batchIds.length === 0) {
    return [];
  }

  // Two steps (roster, then attempts) rather than one join straight from
  // trainingProgramStudents to assessmentAttempts: a student actively
  // enrolled in MORE THAN ONE of the caller's own batchIds (rare, but
  // schema.sql permits it — the same edge case students.repository.ts's
  // listActiveBatchIdsForStudent already flags) would otherwise match
  // trainingProgramStudents once per batch membership, duplicating every
  // one of their attempts in the joined result. Resolving the distinct
  // roster first removes that risk entirely, rather than de-duplicating
  // after the fact.
  const roster = await db
    .selectDistinct({ studentId: trainingProgramStudents.studentId })
    .from(trainingProgramStudents)
    .where(
      and(
        inArray(trainingProgramStudents.batchId, batchIds),
        eq(trainingProgramStudents.status, 'active'),
      ),
    );
  const studentIds = roster.map((row) => row.studentId);
  if (studentIds.length === 0) {
    return [];
  }

  return db
    .select({
      studentId: studentProfiles.id,
      fullName: users.fullName,
      attemptId: assessmentAttempts.id,
      totalScore: assessmentAttempts.totalScore,
    })
    .from(assessmentAttempts)
    .innerJoin(studentProfiles, eq(studentProfiles.id, assessmentAttempts.studentId))
    .innerJoin(users, eq(users.id, studentProfiles.userId))
    .where(
      and(
        inArray(assessmentAttempts.studentId, studentIds),
        eq(assessmentAttempts.status, 'submitted'),
      ),
    );
}

export const reportsRepository = {
  listMyAttempts,
  findAttemptSummaryById,
  listAttemptQuestionBreakdown,
  findLatestCodingSubmissionCounts,
  listSubmittedAttemptsForBatches,
};
