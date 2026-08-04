import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessmentBatches, assessments, assessmentSections } from '../../db/schema/assessments.schema';
import { assessmentAttempts, attemptQuestionSelections, attemptResponses } from '../../db/schema/attempts.schema';
import { users } from '../../db/schema/identity.schema';
import { batches, colleges, departments, trainingPrograms } from '../../db/schema/organization.schema';
import { questionCategories, questions, questionVersions } from '../../db/schema/question-bank.schema';
import { studentProfiles, trainingProgramStudents } from '../../db/schema/students.schema';
import { trainingSessions } from '../../db/schema/trainers.schema';
import type { Assessment, AssessmentAttempt } from '../../db/types';

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

// --- Batch assessment participation (item 10 part 1) ---
//
// STATUSES_WITH_PARTICIPATION: an assessment still in draft/review/
// approved status has never been visible to students at all (assessments.
// repository.ts's own listAvailableAssessments only ever surfaces
// 'scheduled'/'live' to students, and attempts.service.ts's
// assertBatchAuthorized — the real gate on starting an attempt — can't
// pass against anything earlier in the lifecycle either), so a draft
// assessment would trivially show "0/Y attempted" and add noise rather
// than a real participation signal. 'completed'/'archived' are INCLUDED
// here even though listAvailableAssessments excludes both for students
// (an assessment a student can no longer start is still one a trainer
// needs to review participation on, indefinitely — this list is
// staff-facing, not a reuse of that student-facing query) — 'archived' in
// particular matches assessments.service.ts's own BATCH_LOCKED_STATUSES
// grouping (['live', 'completed', 'archived']: every status once an
// assessment has actually gone live and can carry real attempts).
const STATUSES_WITH_PARTICIPATION: Assessment['status'][] = [
  'scheduled',
  'live',
  'completed',
  'archived',
];

export interface BatchAssignedAssessmentRow {
  assessmentId: string;
  title: string;
  status: Assessment['status'];
  testCategory: Assessment['testCategory'];
  startAt: Date | null;
  endAt: Date | null;
}

// assessment_batches -> assessments, staff-facing sibling of
// assessments.repository.ts's listAvailableAssessments (that one is
// student-facing: batchIds is an array resolved from the STUDENT's own
// active batches, and it can only ever narrow to 'scheduled'/'live'). This
// module already directly joins assessment_batches/assessments here
// rather than routing through assessmentsService, matching this whole
// file's established "analytics is CLAUDE.md's cross-module-query
// exception" precedent (see this file's own top-of-file comment) instead
// of repurposing a query built for a different caller/scope.
async function listAssessmentsAssignedToBatch(batchId: string): Promise<BatchAssignedAssessmentRow[]> {
  return db
    .select({
      assessmentId: assessments.id,
      title: assessments.title,
      status: assessments.status,
      testCategory: assessments.testCategory,
      startAt: assessments.startAt,
      endAt: assessments.endAt,
    })
    .from(assessmentBatches)
    .innerJoin(
      assessments,
      and(eq(assessments.id, assessmentBatches.assessmentId), isNull(assessments.deletedAt)),
    )
    .where(
      and(
        eq(assessmentBatches.batchId, batchId),
        inArray(assessments.status, STATUSES_WITH_PARTICIPATION),
      ),
    )
    .orderBy(desc(assessments.startAt));
}

// The batch's own active-student roster as bare ids — reused both as the
// participation denominator (its length) and to scope the attempted-count
// query below to students CURRENTLY active in this batch (an attempt from
// a student since moved to another batch/withdrawn shouldn't count toward
// THIS batch's participation). Same trainingProgramStudents.status='active'
// filter every other analytics query in this file already applies.
async function listActiveStudentIdsForBatch(batchId: string): Promise<string[]> {
  const rows = await db
    .select({ studentId: trainingProgramStudents.studentId })
    .from(trainingProgramStudents)
    .where(
      and(eq(trainingProgramStudents.batchId, batchId), eq(trainingProgramStudents.status, 'active')),
    );
  return rows.map((row) => row.studentId);
}

export interface AttemptedCountRow {
  assessmentId: string;
  attemptedCount: number;
}

// Distinct-student attempt count per assessment, bounded to exactly the
// (assessmentId, studentId) pairs analytics.service.ts's
// getBatchAssessmentParticipation asks for — one query for every
// assessment in the batch at once (inArray), not one query per assessment.
// DISTINCT on studentId: a student with multiple attempts (retakes) on the
// same assessment still counts once toward participation, not once per
// attempt.
async function countAttemptedStudentsByAssessment(
  assessmentIds: string[],
  studentIds: string[],
): Promise<AttemptedCountRow[]> {
  if (assessmentIds.length === 0 || studentIds.length === 0) {
    return [];
  }
  return db
    .select({
      assessmentId: assessmentAttempts.assessmentId,
      attemptedCount: sql<number>`count(distinct ${assessmentAttempts.studentId})`,
    })
    .from(assessmentAttempts)
    .where(
      and(
        inArray(assessmentAttempts.assessmentId, assessmentIds),
        inArray(assessmentAttempts.studentId, studentIds),
      ),
    )
    .groupBy(assessmentAttempts.assessmentId);
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

// --- Super Admin platform analytics ---
//
// Everything below is genuinely new — no existing function in this file
// (or anywhere else) aggregates across colleges. See analytics.service.ts's
// getPlatformOverview/getCollegePerformance/getCategoryImprovement for the
// design reasoning; this file only holds the raw queries, matching this
// module's own routes->controller->service->repository split (ALL Drizzle
// queries live here, per CLAUDE.md, no aggregation math in this file).

// Assessments have no direct college FK (only reachable via
// assessment_batches -> batches -> training_programs) — this is the new
// join that path requires. COUNT DISTINCT because the same assessment can
// be assigned to more than one batch under the same college.
async function countActiveAssessmentsForCollege(collegeId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${assessments.id})` })
    .from(assessmentBatches)
    .innerJoin(
      assessments,
      and(eq(assessments.id, assessmentBatches.assessmentId), isNull(assessments.deletedAt)),
    )
    .innerJoin(batches, eq(batches.id, assessmentBatches.batchId))
    .innerJoin(trainingPrograms, eq(trainingPrograms.id, batches.trainingProgramId))
    .where(and(eq(trainingPrograms.collegeId, collegeId), eq(assessments.status, 'live')));
  return Number(row?.count ?? 0);
}

export interface AllCollegesRow {
  id: string;
  name: string;
}

// Every non-deleted college — used by getCollegePerformance so a college
// with ZERO submitted attempts still appears in the comparison (rather
// than being silently absent because it never matched a join).
async function listAllColleges(): Promise<AllCollegesRow[]> {
  return db
    .select({ id: colleges.id, name: colleges.name })
    .from(colleges)
    .where(isNull(colleges.deletedAt));
}

export interface SubmittedAttemptScopeRow {
  attemptId: string;
  studentId: string;
  collegeId: string;
  collegeName: string;
  // Nullable in the schema (assessment_attempts.total_score has no
  // NOT NULL) — a 'submitted' row is expected to have this set, but this
  // isn't assumed; analytics.service.ts filters null before computing a
  // percentage, same defensive treatment sumPossibleMarksForAttempts'
  // own callers already apply.
  totalScore: string | null;
  // Only populated in the batchIds-scoped branch (getMyBatchPerformance's
  // per-batch grouping needs it) — undefined in the collegeId-scoped
  // branch, where trainingProgramStudents isn't joined at all. If a
  // student is genuinely active in more than one of the caller's batches
  // at once, this attempt legitimately appears once per matching batch —
  // not a duplicate to dedupe, unlike the collegeId branch's own
  // selectDistinct guard (a student has exactly one college, so any
  // repeat there really would be a join artifact).
  batchId?: string;
}

// Mutually exclusive scope — collegeId for Super Admin's platform analytics
// (Phase 2), batchIds for Faculty's own analytics (Phase 3, self-scoped via
// batch_trainers). Both omitted = platform-wide/unscoped (only ever reached
// by Super Admin callers, enforced in analytics.service.ts, not here).
export interface AttemptScope {
  collegeId?: string;
  batchIds?: string[];
}

const SUBMITTED_ATTEMPT_SCOPE_COLUMNS = {
  attemptId: assessmentAttempts.id,
  studentId: assessmentAttempts.studentId,
  collegeId: studentProfiles.collegeId,
  collegeName: colleges.name,
  totalScore: assessmentAttempts.totalScore,
} as const;

// Backs getPlatformOverview/getCollegePerformance (collegeId, or omitted
// for platform-wide) AND getMyOverview/getMyBatchPerformance (batchIds,
// Phase 3) — one shared column/base-join shape, two call shapes, same
// "don't duplicate the join" reasoning every other reuse in this file
// already follows (e.g. sumPossibleMarksForAttempts backing both
// getBatchPerformance and getScorePercentagesForAttempts). The batchIds
// branch adds the same trainingProgramStudents join
// listBatchAttemptsForAssessment already uses for ONE batch, widened to
// inArray for several — status = 'active' so a student since moved off
// the batch doesn't count. Two separate query builds (not one dynamically
// assembled one), matching assessments.repository.ts's own listAssessments
// precedent for this exact "different join depending on scope" shape.
async function listSubmittedAttempts(scope: AttemptScope = {}): Promise<SubmittedAttemptScopeRow[]> {
  if (scope.batchIds) {
    if (scope.batchIds.length === 0) {
      return [];
    }
    // selectDistinct here is NOT a dedup-of-artifacts guard the way the
    // collegeId branch below would need one — batchId is part of the
    // selected columns, so a student genuinely active in two of the
    // caller's batches at once correctly yields one row per (attempt,
    // batch) pair, which is exactly what getMyBatchPerformance's
    // per-batch grouping needs. selectDistinct only collapses true
    // byte-identical duplicates (e.g. a defensive no-op if a future
    // schema change ever allowed two active rows for the very same
    // student+batch pair).
    return db
      .selectDistinct({
        ...SUBMITTED_ATTEMPT_SCOPE_COLUMNS,
        batchId: trainingProgramStudents.batchId,
      })
      .from(assessmentAttempts)
      .innerJoin(studentProfiles, eq(studentProfiles.id, assessmentAttempts.studentId))
      .innerJoin(colleges, eq(colleges.id, studentProfiles.collegeId))
      .innerJoin(
        trainingProgramStudents,
        eq(trainingProgramStudents.studentId, studentProfiles.id),
      )
      .where(
        and(
          eq(assessmentAttempts.status, 'submitted'),
          inArray(trainingProgramStudents.batchId, scope.batchIds),
          eq(trainingProgramStudents.status, 'active'),
        ),
      );
  }

  const conditions = [eq(assessmentAttempts.status, 'submitted')];
  if (scope.collegeId) conditions.push(eq(studentProfiles.collegeId, scope.collegeId));

  return db
    .select(SUBMITTED_ATTEMPT_SCOPE_COLUMNS)
    .from(assessmentAttempts)
    .innerJoin(studentProfiles, eq(studentProfiles.id, assessmentAttempts.studentId))
    .innerJoin(colleges, eq(colleges.id, studentProfiles.collegeId))
    .where(and(...conditions));
}

export interface CategoryResponseRow {
  studentId: string;
  attemptId: string;
  attemptCreatedAt: Date;
  categoryId: string;
  categoryName: string;
  // Null for an unanswered-but-frozen question or a not-yet-graded one —
  // see attempt_responses.schema's own comment (populated for MCQ only at
  // submit-response time). getCategoryImprovement treats null as 0
  // obtained, same coalesce-to-0 convention sumPossibleMarksForAttempts'
  // COALESCE(sum(...), 0) already applies at the SQL level.
  marksObtained: string | null;
  questionMarks: string;
}

// The 3-hop join nothing in this codebase performs anywhere else:
// attempt_responses -> question_versions -> questions.category_id ->
// question_categories, joined back to assessment_attempts (for
// studentId/createdAt/status) and student_profiles (for the optional
// collegeId scope). INNER JOIN questionCategories deliberately EXCLUDES
// uncategorized questions (questions.category_id IS NULL) — see
// analytics.types.ts's CategoryImprovementRow comment. Filtered to
// type='mcq' categories only: coding responses have marksObtained always
// NULL (grading not wired to this analytics path) and psychometric
// responses have no correctness concept at all, so neither can produce a
// real percent score today — see analytics.service.ts's
// getCategoryImprovement for the full caveat surfaced to the caller.
const CATEGORY_RESPONSE_COLUMNS = {
  studentId: assessmentAttempts.studentId,
  attemptId: assessmentAttempts.id,
  attemptCreatedAt: assessmentAttempts.createdAt,
  categoryId: questionCategories.id,
  categoryName: questionCategories.name,
  marksObtained: attemptResponses.marksObtained,
  questionMarks: questionVersions.marks,
} as const;

// Same AttemptScope shape/reasoning as listSubmittedAttempts above — Phase
// 3 addition. selectDistinct on the batchIds branch for the identical
// join-fan-out reason (a student active in >1 of the caller's batches
// would otherwise duplicate every one of their response rows).
async function listMcqCategoryResponses(scope: AttemptScope = {}): Promise<CategoryResponseRow[]> {
  if (scope.batchIds) {
    if (scope.batchIds.length === 0) {
      return [];
    }
    return db
      .selectDistinct(CATEGORY_RESPONSE_COLUMNS)
      .from(attemptResponses)
      .innerJoin(assessmentAttempts, eq(assessmentAttempts.id, attemptResponses.attemptId))
      .innerJoin(studentProfiles, eq(studentProfiles.id, assessmentAttempts.studentId))
      .innerJoin(questionVersions, eq(questionVersions.id, attemptResponses.questionVersionId))
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .innerJoin(questionCategories, eq(questionCategories.id, questions.categoryId))
      .innerJoin(
        trainingProgramStudents,
        eq(trainingProgramStudents.studentId, studentProfiles.id),
      )
      .where(
        and(
          eq(assessmentAttempts.status, 'submitted'),
          eq(questions.type, 'mcq'),
          inArray(trainingProgramStudents.batchId, scope.batchIds),
          eq(trainingProgramStudents.status, 'active'),
        ),
      );
  }

  const conditions = [eq(assessmentAttempts.status, 'submitted'), eq(questions.type, 'mcq')];
  if (scope.collegeId) conditions.push(eq(studentProfiles.collegeId, scope.collegeId));

  return db
    .select(CATEGORY_RESPONSE_COLUMNS)
    .from(attemptResponses)
    .innerJoin(assessmentAttempts, eq(assessmentAttempts.id, attemptResponses.attemptId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, assessmentAttempts.studentId))
    .innerJoin(questionVersions, eq(questionVersions.id, attemptResponses.questionVersionId))
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .innerJoin(questionCategories, eq(questionCategories.id, questions.categoryId))
    .where(and(...conditions));
}

// --- Faculty's own analytics (Phase 3) ---
//
// Only ONE genuinely new query needed beyond the widened
// listSubmittedAttempts/listMcqCategoryResponses above — everything else
// Faculty's overview needs is already reachable via existing cross-module
// SERVICE calls (organizationService.listBatchAssignmentsForTrainers for
// "which batches, with names," assessmentsService.listAssessments'
// existing Faculty batch-scoping for "active assessments") — see
// analytics.service.ts's getMyOverview for exactly how those compose.
//
// studentsService.listStudentProfiles only accepts a single batchId
// (students.repository.ts), not an array, so it can't answer "distinct
// students across several of my batches" without either N calls (and a
// real risk of double-counting a student active in more than one) or this
// one small query — same trainingProgramStudents join
// listActiveStudentIdsForBatch already uses for one batch, widened to
// inArray + COUNT(DISTINCT ...) for several.
async function countActiveStudentsForBatches(batchIds: string[]): Promise<number> {
  if (batchIds.length === 0) {
    return 0;
  }
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${trainingProgramStudents.studentId})` })
    .from(trainingProgramStudents)
    .where(
      and(
        inArray(trainingProgramStudents.batchId, batchIds),
        eq(trainingProgramStudents.status, 'active'),
      ),
    );
  return Number(row?.count ?? 0);
}

export const analyticsRepository = {
  listBatchAttemptsForAssessment,
  findMostRecentAssessmentIdForBatch,
  findAssessmentSectionsThresholdInfo,
  sumPossibleMarksForAttempts,
  listAssessmentActivityForBatch,
  listAssessmentsAssignedToBatch,
  listActiveStudentIdsForBatch,
  countAttemptedStudentsByAssessment,
  listTrainingSessionsOnDate,
  countActiveAssessmentsForCollege,
  listAllColleges,
  listSubmittedAttempts,
  listMcqCategoryResponses,
  countActiveStudentsForBatches,
};
