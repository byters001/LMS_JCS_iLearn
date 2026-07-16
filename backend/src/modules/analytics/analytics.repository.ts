import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessmentSections } from '../../db/schema/assessments.schema';
import { assessmentAttempts, attemptQuestionSelections } from '../../db/schema/attempts.schema';
import { users } from '../../db/schema/identity.schema';
import { colleges, departments, trainingPrograms } from '../../db/schema/organization.schema';
import { questionVersions } from '../../db/schema/question-bank.schema';
import { studentProfiles, trainingProgramStudents } from '../../db/schema/students.schema';
import { trainingSessions } from '../../db/schema/trainers.schema';
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

export interface BatchAssessmentActivity {
  assessmentId: string;
  mostRecentAttemptAt: Date;
}

// Phase 5 (trainer performance trend) — enumeration sibling of
// findMostRecentAssessmentIdForBatch above: same join skeleton (active
// batch students -> their attempts), but GROUPed instead of LIMITed to 1,
// so a trend view can plot every assessment a batch has real attempt
// activity on, ordered chronologically, instead of only ever seeing the
// single most-recent one. Deliberately does NOT compute any score/pass-
// rate itself — analytics.service.ts's getTrainerPerformanceTrend calls
// the existing getBatchPerformance once per (batchId, assessmentId) pair
// this returns, reusing that function's classifyStudent/threshold-
// resolution logic as-is rather than duplicating it here.
async function listAssessmentActivityForBatch(batchId: string): Promise<BatchAssessmentActivity[]> {
  return db
    .select({
      assessmentId: assessmentAttempts.assessmentId,
      mostRecentAttemptAt: sql<Date>`max(${assessmentAttempts.createdAt})`,
    })
    .from(trainingProgramStudents)
    .innerJoin(studentProfiles, eq(studentProfiles.id, trainingProgramStudents.studentId))
    .innerJoin(assessmentAttempts, eq(assessmentAttempts.studentId, studentProfiles.id))
    .where(
      and(
        eq(trainingProgramStudents.batchId, batchId),
        eq(trainingProgramStudents.status, 'active'),
      ),
    )
    .groupBy(assessmentAttempts.assessmentId)
    .orderBy(asc(sql`max(${assessmentAttempts.createdAt})`));
}

// --- Attendance-by-date (Phase 6a chatbot tool) ---
//
// STATED DESIGN DECISION, not silently guessed: this schema has NO
// attendance table (confirmed directly against schema.sql — zero matches
// for "attendance" anywhere). The closest real concept is training_
// sessions (schema.sql: session_date, status). "Attendance on a date"
// here means "which training sessions were scheduled/held on that date,"
// NOT per-student physical presence — there is no roll-call/presence
// concept anywhere in this schema to report on instead. See
// analytics.service.ts's getAttendanceByDate and modules/chatbot's tool
// description for this same caveat surfaced to the actual caller, not
// just left in a code comment.
export interface SessionOnDateRow {
  sessionId: string;
  title: string;
  sessionType: string;
  status: string;
  trainingProgramId: string;
  collegeId: string;
  collegeName: string;
  departmentName: string;
}

// innerJoin throughout: trainingSessions.trainingProgramId and training_
// programs' collegeId/departmentId are all NOT NULL (schema.sql), same
// "no orphan-row risk" reasoning organization.repository.ts's listBatches/
// listMyBatches already established for this identical FK chain.
async function listTrainingSessionsOnDate(
  date: string,
  collegeId: string | undefined,
): Promise<SessionOnDateRow[]> {
  const conditions = [eq(trainingSessions.sessionDate, date)];
  if (collegeId) conditions.push(eq(trainingPrograms.collegeId, collegeId));

  return db
    .select({
      sessionId: trainingSessions.id,
      title: trainingSessions.title,
      sessionType: trainingSessions.sessionType,
      status: trainingSessions.status,
      trainingProgramId: trainingSessions.trainingProgramId,
      collegeId: trainingPrograms.collegeId,
      collegeName: colleges.name,
      departmentName: departments.name,
    })
    .from(trainingSessions)
    .innerJoin(trainingPrograms, eq(trainingPrograms.id, trainingSessions.trainingProgramId))
    .innerJoin(colleges, eq(colleges.id, trainingPrograms.collegeId))
    .innerJoin(departments, eq(departments.id, trainingPrograms.departmentId))
    .where(and(...conditions))
    .orderBy(asc(trainingSessions.sessionDate));
}

export const analyticsRepository = {
  listBatchAttemptsForAssessment,
  findMostRecentAssessmentIdForBatch,
  findAssessmentSectionsThresholdInfo,
  sumPossibleMarksForAttempts,
  listAssessmentActivityForBatch,
  listTrainingSessionsOnDate,
};
