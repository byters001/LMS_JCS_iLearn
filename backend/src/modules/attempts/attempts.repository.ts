import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessmentSections } from '../../db/schema/assessments.schema';
import {
  assessmentAttempts,
  attemptQuestionSelections,
  attemptResponses,
} from '../../db/schema/attempts.schema';
import { questions, questionVersions } from '../../db/schema/question-bank.schema';
import type { AssessmentAttempt, AttemptResponse } from '../../db/types';
import type { AttemptScoreSummary, FrozenAttemptQuestion } from './attempts.types';

// Joining question_versions/assessment_sections/questions directly (rather
// than only ever going through another module's service) mirrors the
// precedent already established in assessments.repository.ts's
// listAssessmentQuestionsWithContent (joins question_versions for display
// content) — read-only joins for a module's own display/grading needs, not
// a write into another module's table.

const OPEN_STATUSES = ['not_started', 'in_progress'] as const;

async function findOpenAttempt(
  assessmentId: string,
  studentId: string,
): Promise<AssessmentAttempt | undefined> {
  const [attempt] = await db
    .select()
    .from(assessmentAttempts)
    .where(
      and(
        eq(assessmentAttempts.assessmentId, assessmentId),
        eq(assessmentAttempts.studentId, studentId),
        inArray(assessmentAttempts.status, OPEN_STATUSES),
      ),
    )
    .limit(1);
  return attempt;
}

// Counts EVERY attempt row regardless of status (including 'invalidated')
// — an invalidated attempt still consumed a real attempt_number; getting a
// genuine extra attempt beyond max_attempts after an invalidation is what
// Part 2's assessment_retake_requests workflow is for, not something this
// count should silently grant by excluding invalidated rows.
async function countAttemptsForStudent(assessmentId: string, studentId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(assessmentAttempts)
    .where(
      and(
        eq(assessmentAttempts.assessmentId, assessmentId),
        eq(assessmentAttempts.studentId, studentId),
      ),
    );
  return Number(row?.count ?? 0);
}

async function findAttemptById(id: string): Promise<AssessmentAttempt | undefined> {
  const [attempt] = await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, id)).limit(1);
  return attempt;
}

async function listAttemptsForStudent(
  studentId: string,
  assessmentId?: string,
): Promise<AssessmentAttempt[]> {
  const conditions = [eq(assessmentAttempts.studentId, studentId)];
  if (assessmentId) conditions.push(eq(assessmentAttempts.assessmentId, assessmentId));

  return db
    .select()
    .from(assessmentAttempts)
    .where(and(...conditions))
    .orderBy(asc(assessmentAttempts.attemptNumber));
}

export interface CreateAttemptData {
  assessmentId: string;
  studentId: string;
  attemptNumber: number;
  isRetake: boolean;
  ipAddress?: string;
  browserInfo?: string;
}

export interface SelectionInput {
  assessmentSectionId: string;
  questionVersionId: string;
  sortOrder: number;
}

// The freeze-exactly-once write: the assessment_attempts row and every one
// of its attempt_question_selections rows (across every section, manual
// and pool alike — already resolved by the caller via
// assessmentsService.resolveSectionQuestions before this function is
// called) commit as one atomic unit. If anything after the attempt row is
// inserted fails, the whole transaction rolls back — there is no code path
// that leaves an in_progress attempt behind with partial or zero frozen
// selections. See attempts.service.ts's startAttempt for why the
// resolution reads themselves happen just before this call rather than
// inside this same transaction (resolveSectionQuestions is a cross-module
// SERVICE call per CLAUDE.md's boundary rule, and doesn't accept a `tx`
// handle to participate in this transaction — it doesn't need to, since
// it's read-only and its result is what's being frozen here).
async function createAttemptWithSelections(
  data: CreateAttemptData,
  selections: SelectionInput[],
): Promise<AssessmentAttempt> {
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .insert(assessmentAttempts)
      .values({
        assessmentId: data.assessmentId,
        studentId: data.studentId,
        attemptNumber: data.attemptNumber,
        status: 'in_progress',
        startTime: new Date(),
        isRetake: data.isRetake,
        ipAddress: data.ipAddress,
        browserInfo: data.browserInfo,
      })
      .returning();

    if (selections.length > 0) {
      await tx.insert(attemptQuestionSelections).values(
        selections.map((selection) => ({
          attemptId: attempt.id,
          assessmentSectionId: selection.assessmentSectionId,
          questionVersionId: selection.questionVersionId,
          sortOrder: selection.sortOrder,
        })),
      );
    }

    return attempt;
  });
}

// Read from attempt_question_selections ONLY — this is the enforcement
// point for "never re-resolve live for an existing attempt." Ordered by
// the parent section's own section_order first, then this question's
// sort_order within that section, so the list renders in the same section
// sequence the assessment was authored in.
async function listFrozenQuestions(attemptId: string): Promise<FrozenAttemptQuestion[]> {
  const rows = await db
    .select({
      id: attemptQuestionSelections.id,
      assessmentSectionId: attemptQuestionSelections.assessmentSectionId,
      questionVersionId: attemptQuestionSelections.questionVersionId,
      questionText: questionVersions.questionText,
      marks: questionVersions.marks,
      sortOrder: attemptQuestionSelections.sortOrder,
      sectionOrder: assessmentSections.sectionOrder,
    })
    .from(attemptQuestionSelections)
    .innerJoin(
      questionVersions,
      eq(questionVersions.id, attemptQuestionSelections.questionVersionId),
    )
    .innerJoin(
      assessmentSections,
      eq(assessmentSections.id, attemptQuestionSelections.assessmentSectionId),
    )
    .where(eq(attemptQuestionSelections.attemptId, attemptId))
    .orderBy(asc(assessmentSections.sectionOrder), asc(attemptQuestionSelections.sortOrder));

  return rows.map(({ sectionOrder: _sectionOrder, ...row }) => row);
}

// Confirms questionVersionId is actually one of this attempt's frozen
// selections before a response is allowed to reference it — see
// attempts.service.ts's submitResponse.
async function findSelection(
  attemptId: string,
  questionVersionId: string,
): Promise<{ id: string } | undefined> {
  const [row] = await db
    .select({ id: attemptQuestionSelections.id })
    .from(attemptQuestionSelections)
    .where(
      and(
        eq(attemptQuestionSelections.attemptId, attemptId),
        eq(attemptQuestionSelections.questionVersionId, questionVersionId),
      ),
    )
    .limit(1);
  return row;
}

export interface UpsertResponseData {
  selectedOptionId?: string | null;
  likertValue?: number | null;
  isMarkedForReview?: boolean;
  isCorrect?: boolean | null;
  marksObtained?: string | null;
  timeSpentSeconds?: number | null;
}

// UNIQUE(attempt_id, question_version_id) is what makes this a real upsert
// rather than a check-then-insert/update race — a second submitResponse
// call for the same question always lands on the same row via ON CONFLICT,
// never creates a duplicate.
async function upsertResponse(
  attemptId: string,
  questionVersionId: string,
  data: UpsertResponseData,
): Promise<AttemptResponse> {
  const [row] = await db
    .insert(attemptResponses)
    .values({
      attemptId,
      questionVersionId,
      selectedOptionId: data.selectedOptionId,
      likertValue: data.likertValue,
      isMarkedForReview: data.isMarkedForReview,
      isCorrect: data.isCorrect,
      marksObtained: data.marksObtained,
      timeSpentSeconds: data.timeSpentSeconds,
    })
    .onConflictDoUpdate({
      target: [attemptResponses.attemptId, attemptResponses.questionVersionId],
      set: {
        selectedOptionId: data.selectedOptionId,
        likertValue: data.likertValue,
        isMarkedForReview: data.isMarkedForReview,
        isCorrect: data.isCorrect,
        marksObtained: data.marksObtained,
        timeSpentSeconds: data.timeSpentSeconds,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

// SUM(marks_obtained) over Postgres already treats NULL as 0 for both
// unanswered questions (no row at all) and answered-but-ungraded ones (a
// row exists but marks_obtained IS NULL) — see attempts.service.ts's
// submitAttempt for the full "what happens to ungraded/unanswered
// questions" reasoning. hasUngradedCoding flags whether any response
// belongs to a 'coding'-type question — the signal submitAttempt uses to
// choose 'pending_evaluation' over 'submitted' (coding grading is deferred
// entirely to the future coding module's Judge0 integration, out of scope
// here).
async function sumResponsesForAttempt(attemptId: string): Promise<AttemptScoreSummary> {
  const [row] = await db
    .select({
      totalScore: sql<string>`coalesce(sum(${attemptResponses.marksObtained}), 0)`,
      hasUngradedCoding: sql<boolean>`bool_or(${questions.type} = 'coding' and ${attemptResponses.marksObtained} is null)`,
    })
    .from(attemptResponses)
    .innerJoin(questionVersions, eq(questionVersions.id, attemptResponses.questionVersionId))
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .where(eq(attemptResponses.attemptId, attemptId));

  return {
    totalScore: row?.totalScore ?? '0',
    hasUngradedCoding: Boolean(row?.hasUngradedCoding),
  };
}

export interface FinalizeAttemptData {
  status: 'submitted' | 'pending_evaluation';
  totalScore: string;
}

// Guarded by WHERE status = 'in_progress' — a concurrent double-submit
// (double-click, retry) finds zero matching rows on its second attempt and
// gets undefined back rather than silently recomputing/overwriting the
// score a second time. See attempts.service.ts's submitAttempt for how
// that undefined is turned into a ConflictError, and this module's
// overview comment for why this is a partial, structural mitigation for
// CLAUDE.md's Idempotency-Key requirement rather than the full Redis-backed
// mechanism (not built in this phase).
async function finalizeAttempt(
  id: string,
  data: FinalizeAttemptData,
): Promise<AssessmentAttempt | undefined> {
  const [updated] = await db
    .update(assessmentAttempts)
    .set({
      status: data.status,
      totalScore: data.totalScore,
      endTime: new Date(),
      submissionTime: new Date(),
    })
    .where(and(eq(assessmentAttempts.id, id), eq(assessmentAttempts.status, 'in_progress')))
    .returning();
  return updated;
}

export const attemptsRepository = {
  findOpenAttempt,
  countAttemptsForStudent,
  findAttemptById,
  listAttemptsForStudent,
  createAttemptWithSelections,
  listFrozenQuestions,
  findSelection,
  upsertResponse,
  sumResponsesForAttempt,
  finalizeAttempt,
};
