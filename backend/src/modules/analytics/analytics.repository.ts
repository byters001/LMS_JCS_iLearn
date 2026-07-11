import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessmentSections } from '../../db/schema/assessments.schema';
import { assessmentAttempts, attemptQuestionSelections } from '../../db/schema/attempts.schema';
import { users } from '../../db/schema/identity.schema';
import { questionVersions } from '../../db/schema/question-bank.schema';
import { studentProfiles, trainingProgramStudents } from '../../db/schema/students.schema';
import type { AssessmentAttempt } from '../../db/types';

// analytics is CLAUDE.md's explicit cross-module-QUERY exception (shared
// with reports — "their whole purpose is cross-cutting aggregation")
// every query below joins directly across students/attempts/
// question-bank/assessments' own tables. Nothing here writes anything —
// read-only, matching this phase's stated scope. Batch/college
// resolution and the assessment's own title are deliberately NOT
// re-queried here — analytics.service.ts reuses
// organizationService.findBatchById/findTrainingProgramById and
// assessmentsService.findAssessmentById instead (already-existing
// cross-module SERVICE calls), per the "don't duplicate query logic
// already... reusable" instruction.

export interface BatchAttemptRow {
  studentId: string;
  fullName: string;
  attemptId: string | null;
  totalScore: string | null;
  status: AssessmentAttempt['status'] | null;
}

// One row per (active batch student, matching attempt) via LEFT JOIN —
// a student with zero attempts on this assessment still gets exactly one
// row, with attemptId/totalScore/status all null. A student with several
// attempts (retakes) gets one row per attempt; analytics.service.ts's
// classifyStudent reduces that down to one classified row per student.
async function listBatchAttemptsForAssessment(
  batchId: string,
  assessmentId: string,
): Promise<BatchAttemptRow[]> {
  return db
    .select({
      studentId: studentProfiles.id,
      fullName: users.fullName,
      attemptId: assessmentAttempts.id,
      totalScore: assessmentAttempts.totalScore,
      status: assessmentAttempts.status,
    })
    .from(trainingProgramStudents)
    .innerJoin(studentProfiles, eq(studentProfiles.id, trainingProgramStudents.studentId))
    .innerJoin(users, eq(users.id, studentProfiles.userId))
    .leftJoin(
      assessmentAttempts,
      and(
        eq(assessmentAttempts.studentId, studentProfiles.id),
        eq(assessmentAttempts.assessmentId, assessmentId),
      ),
    )
    .where(
      and(
        eq(trainingProgramStudents.batchId, batchId),
        eq(trainingProgramStudents.status, 'active'),
      ),
    );
}

// Default-assessment resolution (item 1's "or across all assessments if
// none specified" — see analytics.service.ts's module comment for why
// this picks ONE assessment rather than pooling raw scores across
// differently-scaled assessments): the assessment with the most recent
// attempt activity among this batch's active students.
async function findMostRecentAssessmentIdForBatch(batchId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ assessmentId: assessmentAttempts.assessmentId })
    .from(trainingProgramStudents)
    .innerJoin(studentProfiles, eq(studentProfiles.id, trainingProgramStudents.studentId))
    .innerJoin(assessmentAttempts, eq(assessmentAttempts.studentId, studentProfiles.id))
    .where(
      and(
        eq(trainingProgramStudents.batchId, batchId),
        eq(trainingProgramStudents.status, 'active'),
      ),
    )
    .orderBy(desc(assessmentAttempts.createdAt))
    .limit(1);
  return row?.assessmentId;
}

export interface AssessmentSectionsThresholdInfo {
  sectionCount: number;
  sectionsWithThreshold: number;
  sumThreshold: string;
}

// Confirmed directly against schema.sql (item 1): passing_marks lives on
// assessment_sections, NOT on assessments itself — there is no
// assessment-level passing threshold column at all. This computes
// whether EVERY section of the assessment has an explicit passing_marks
// set; analytics.service.ts only trusts the sum when that's true for all
// of them (see its module comment for why a partial sum would be
// misleading).
async function findAssessmentSectionsThresholdInfo(
  assessmentId: string,
): Promise<AssessmentSectionsThresholdInfo> {
  const [row] = await db
    .select({
      sectionCount: sql<number>`count(*)`,
      sectionsWithThreshold: sql<number>`count(${assessmentSections.passingMarks})`,
      sumThreshold: sql<string>`coalesce(sum(${assessmentSections.passingMarks}), 0)`,
    })
    .from(assessmentSections)
    .where(eq(assessmentSections.assessmentId, assessmentId));

  return {
    sectionCount: Number(row?.sectionCount ?? 0),
    sectionsWithThreshold: Number(row?.sectionsWithThreshold ?? 0),
    sumThreshold: row?.sumThreshold ?? '0',
  };
}

export interface AttemptPossibleMarks {
  attemptId: string;
  totalPossibleMarks: string;
}

// Total possible marks PER ATTEMPT (not per assessment) — deliberately:
// a pool-based section's frozen selections (attempt_question_selections)
// can draw a different set of questions, and therefore a different total
// possible marks, on every attempt. Summing from each attempt's own
// frozen selections (the same table attempts.service.ts's
// getAttemptQuestions/reports.repository.ts already treat as the one
// source of truth for "what this attempt actually included") is the only
// way to get a value that's correct for that specific attempt.
async function sumPossibleMarksForAttempts(
  attemptIds: string[],
): Promise<AttemptPossibleMarks[]> {
  if (attemptIds.length === 0) {
    return [];
  }
  return db
    .select({
      attemptId: attemptQuestionSelections.attemptId,
      totalPossibleMarks: sql<string>`coalesce(sum(${questionVersions.marks}), 0)`,
    })
    .from(attemptQuestionSelections)
    .innerJoin(
      questionVersions,
      eq(questionVersions.id, attemptQuestionSelections.questionVersionId),
    )
    .where(inArray(attemptQuestionSelections.attemptId, attemptIds))
    .groupBy(attemptQuestionSelections.attemptId);
}

export const analyticsRepository = {
  listBatchAttemptsForAssessment,
  findMostRecentAssessmentIdForBatch,
  findAssessmentSectionsThresholdInfo,
  sumPossibleMarksForAttempts,
};
