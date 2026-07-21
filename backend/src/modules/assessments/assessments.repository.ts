import { and, asc, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  assessmentApprovalHistory,
  assessmentBatches,
  assessmentQuestions,
  assessmentSectionPools,
  assessmentSections,
  assessments,
} from '../../db/schema/assessments.schema';
// Reading assessment_attempts directly (read-only) mirrors the precedent
// attempts.repository.ts's own module comment already established (it reads
// assessment_sections/questions/question_versions directly for its own
// display needs) and reports.repository.ts's cross-module join — a table
// schema import across modules/, not a routes/controller/service/repository
// import, so this doesn't cross CLAUDE.md's actual module-boundary rule
// (that rule is about calling another module's repository FUNCTIONS, not
// importing its Drizzle table definition for a read-only join).
import { assessmentAttempts } from '../../db/schema/attempts.schema';
import { questionVersions } from '../../db/schema/question-bank.schema';
import type {
  Assessment,
  AssessmentApprovalHistory,
  AssessmentAttempt,
  AssessmentQuestion,
  AssessmentSection,
  AssessmentSectionPool,
} from '../../db/types';
import { ConflictError } from '../../shared/errors/app-error';
import type { AvailableAssessment } from './assessments.types';

// --- Assessments ---
// Soft delete: deleted_at exists in schema.sql, same treatment as questions/
// question_pools.

export interface ListAssessmentsParams {
  trainingSessionId?: string;
  status?: 'draft' | 'review' | 'approved' | 'scheduled' | 'live' | 'completed' | 'archived';
  testCategory?: 'mcq' | 'coding' | 'psychometric' | 'mixed';
  search?: string;
  // Item 6 (faculty batch-scoping) — undefined means "unscoped," and takes
  // this function down the EXACT SAME code path (plain select, no join, no
  // distinct) it ran before this fix, byte-for-byte. Only assessments.
  // service.ts's caller ever sets this, and only for a non-super_admin
  // caller; super_admin always passes undefined, matching the explicit
  // requirement that super_admin's query path stay completely unscoped.
  // An empty array is the real "faculty assigned to zero batches" case —
  // short-circuits to no results, same "empty batchIds -> skip the query"
  // precedent listAvailableAssessments below already established.
  batchIds?: string[];
  page: number;
  pageSize: number;
}

export interface ListAssessmentsResult {
  items: Assessment[];
  total: number;
}

function buildAssessmentsWhere(
  params: Omit<ListAssessmentsParams, 'page' | 'pageSize' | 'batchIds'>,
) {
  const conditions = [isNull(assessments.deletedAt)];
  if (params.trainingSessionId) {
    conditions.push(eq(assessments.trainingSessionId, params.trainingSessionId));
  }
  if (params.status) conditions.push(eq(assessments.status, params.status));
  if (params.testCategory) conditions.push(eq(assessments.testCategory, params.testCategory));
  // title is a direct column on assessments — no join needed, unlike
  // students/questions' search fields.
  if (params.search) conditions.push(ilike(assessments.title, `%${params.search}%`));
  return and(...conditions);
}

async function listAssessments(params: ListAssessmentsParams): Promise<ListAssessmentsResult> {
  const { page, pageSize, batchIds, ...filters } = params;
  const offset = (page - 1) * pageSize;
  const where = buildAssessmentsWhere(filters);

  if (batchIds !== undefined) {
    // Faculty path (item 6) — same join/selectDistinct shape as
    // listAvailableAssessments below, applied to the staff query's own
    // filters instead of the student-facing status restriction.
    if (batchIds.length === 0) {
      return { items: [], total: 0 };
    }

    const scopedWhere = and(where, inArray(assessmentBatches.batchId, batchIds));

    const [items, totalRows] = await Promise.all([
      db
        .selectDistinct({ assessment: assessments })
        .from(assessments)
        .innerJoin(assessmentBatches, eq(assessmentBatches.assessmentId, assessments.id))
        .where(scopedWhere)
        .orderBy(desc(assessments.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(distinct ${assessments.id})` })
        .from(assessments)
        .innerJoin(assessmentBatches, eq(assessmentBatches.assessmentId, assessments.id))
        .where(scopedWhere),
    ]);

    return {
      items: items.map((row) => row.assessment),
      total: Number(totalRows[0]?.count ?? 0),
    };
  }

  // Super_admin path — UNCHANGED from before item 6, same query every line.
  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(assessments)
      .where(where)
      .orderBy(desc(assessments.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(assessments).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

export interface ListAvailableAssessmentsParams {
  batchIds: string[];
  // Layout/button-state phase — added so this same query can also surface
  // the caller's own latest attempt per assessment (see myLatestAttempt
  // below). assessments.service.ts already resolves studentProfile.id at
  // the top of listAvailableAssessments for the batchIds lookup, so this is
  // free to thread through, not a new lookup.
  studentId: string;
  status?: 'scheduled' | 'live';
  page: number;
  pageSize: number;
}

// Student-facing counterpart to listAssessments above — filtered to
// assessment_batches membership (batchIds = the caller's own active batch
// ids, resolved by assessments.service.ts via studentsService), NOT a
// trainingSessionId/arbitrary-status staff query. Restricted to
// 'scheduled'/'live' (or whichever one of those two the caller asked for)
// — see listAvailableAssessmentsQuerySchema's comment for why those are the
// only two statuses a student should ever see here. DISTINCT guards against
// an assessment linked to more than one of the student's batches, same
// precaution as students.repository.ts's own batchId-joined listStudentProfiles.
//
// Layout/button-state phase — myLatestAttempt added: the frontend needs to
// tell Start/Continue/Completed apart per card without an N+1 lookup per
// row (StudentAssessmentsPage.tsx would otherwise need one attempts query
// per card). A straightforward join addition, not a new endpoint: a LEFT
// JOIN (not INNER — most assessments will have no attempt at all for a
// given student, and that must not drop the assessment from the list)
// against a DISTINCT ON (assessment_id) subquery of this student's own
// assessment_attempts rows, ordered by attempt_number DESC so exactly one
// row — the most recent attempt — survives per assessment. Confirmed
// db.selectDistinctOn(...) exists in this installed drizzle-orm version
// before writing this, not assumed.
async function listAvailableAssessments(
  params: ListAvailableAssessmentsParams,
): Promise<{ items: AvailableAssessment[]; total: number }> {
  const { batchIds, studentId, status, page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  // No batches -> no possible matches; skip the query entirely rather than
  // let an empty inArray(...) silently produce a WHERE false with an extra
  // round trip.
  if (batchIds.length === 0) {
    return { items: [], total: 0 };
  }

  const where = and(
    isNull(assessments.deletedAt),
    status ? eq(assessments.status, status) : inArray(assessments.status, ['scheduled', 'live']),
    inArray(assessmentBatches.batchId, batchIds),
  );

  const latestAttempts = db
    .selectDistinctOn([assessmentAttempts.assessmentId], {
      assessmentId: assessmentAttempts.assessmentId,
      id: assessmentAttempts.id,
      status: assessmentAttempts.status,
      attemptNumber: assessmentAttempts.attemptNumber,
    })
    .from(assessmentAttempts)
    .where(eq(assessmentAttempts.studentId, studentId))
    .orderBy(assessmentAttempts.assessmentId, desc(assessmentAttempts.attemptNumber))
    .as('latest_attempts');

  const [items, totalRows] = await Promise.all([
    db
      .selectDistinct({
        assessment: assessments,
        myLatestAttemptId: latestAttempts.id,
        myLatestAttemptStatus: latestAttempts.status,
        myLatestAttemptNumber: latestAttempts.attemptNumber,
      })
      .from(assessments)
      .innerJoin(assessmentBatches, eq(assessmentBatches.assessmentId, assessments.id))
      .leftJoin(latestAttempts, eq(latestAttempts.assessmentId, assessments.id))
      .where(where)
      .orderBy(asc(assessments.startAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(distinct ${assessments.id})` })
      .from(assessments)
      .innerJoin(assessmentBatches, eq(assessmentBatches.assessmentId, assessments.id))
      .where(where),
  ]);

  return {
    items: items.map((row) => ({
      ...row.assessment,
      myLatestAttempt: row.myLatestAttemptId
        ? {
            id: row.myLatestAttemptId,
            // Non-null: myLatestAttemptStatus/Number always accompany
            // myLatestAttemptId (all three come from the same LEFT JOINed
            // row), TypeScript just can't correlate that across three
            // separately-nullable columns on its own.
            status: row.myLatestAttemptStatus as AssessmentAttempt['status'],
            attemptNumber: row.myLatestAttemptNumber as number,
          }
        : null,
    })),
    total: Number(totalRows[0]?.count ?? 0),
  };
}

async function findAssessmentById(id: string): Promise<Assessment | undefined> {
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, id), isNull(assessments.deletedAt)))
    .limit(1);
  return assessment;
}

export interface CreateAssessmentData {
  trainingSessionId?: string;
  title: string;
  description?: string;
  testCategory: 'mcq' | 'coding' | 'psychometric' | 'mixed';
  timerMinutes?: number;
  startAt?: Date;
  endAt?: Date;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  randomQuestionCount?: number;
  negativeMarking?: boolean;
  negativeMarkingValue?: number;
  proctoringCameraRequired?: boolean;
  proctoringFullscreenRequired?: boolean;
  isPractice?: boolean;
  createdBy: string | null;
}

// Transactionally creates the assessments row plus its assessment_batches
// rows — one atomic unit, mirroring question-bank's createQuestionWithVersion
// (questions row + first version, together or not at all). See
// assessments.service.ts's module comment for why assessment_batches is
// modeled as part of creation rather than a separate CRUD resource.
async function createAssessmentWithBatches(
  data: CreateAssessmentData,
  batchIds: string[],
): Promise<Assessment> {
  return db.transaction(async (tx) => {
    const [assessment] = await tx
      .insert(assessments)
      .values({
        trainingSessionId: data.trainingSessionId,
        title: data.title,
        description: data.description,
        testCategory: data.testCategory,
        timerMinutes: data.timerMinutes,
        startAt: data.startAt,
        endAt: data.endAt,
        maxAttempts: data.maxAttempts,
        shuffleQuestions: data.shuffleQuestions,
        randomQuestionCount: data.randomQuestionCount,
        negativeMarking: data.negativeMarking,
        negativeMarkingValue:
          data.negativeMarkingValue !== undefined ? String(data.negativeMarkingValue) : undefined,
        proctoringCameraRequired: data.proctoringCameraRequired,
        proctoringFullscreenRequired: data.proctoringFullscreenRequired,
        isPractice: data.isPractice,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
      })
      .returning();

    if (batchIds.length > 0) {
      await tx
        .insert(assessmentBatches)
        .values(batchIds.map((batchId) => ({ assessmentId: assessment.id, batchId })));
    }

    return assessment;
  });
}

export interface UpdateAssessmentData {
  title?: string;
  description?: string | null;
  timerMinutes?: number | null;
  startAt?: Date | null;
  endAt?: Date | null;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  randomQuestionCount?: number | null;
  negativeMarking?: boolean;
  negativeMarkingValue?: number | null;
  proctoringCameraRequired?: boolean;
  proctoringFullscreenRequired?: boolean;
  isPractice?: boolean;
  updatedBy?: string | null;
}

async function updateAssessment(
  id: string,
  data: UpdateAssessmentData,
): Promise<Assessment | undefined> {
  const { negativeMarkingValue, ...rest } = data;
  const [updated] = await db
    .update(assessments)
    .set(
      negativeMarkingValue !== undefined
        ? { ...rest, negativeMarkingValue: negativeMarkingValue === null ? null : String(negativeMarkingValue) }
        : rest,
    )
    .where(and(eq(assessments.id, id), isNull(assessments.deletedAt)))
    .returning();
  return updated;
}

// Full-set replace (delete all, insert the new list) — matches
// updateAssessmentSchema's batchIds semantics (replace, not patch-merge).
// Wrapped in its own transaction, separate from update's own field SET,
// since a caller might update batches without touching any other field.
async function replaceAssessmentBatches(assessmentId: string, batchIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(assessmentBatches).where(eq(assessmentBatches.assessmentId, assessmentId));
    if (batchIds.length > 0) {
      await tx
        .insert(assessmentBatches)
        .values(batchIds.map((batchId) => ({ assessmentId, batchId })));
    }
  });
}

async function listAssessmentBatchIds(assessmentId: string): Promise<string[]> {
  const rows = await db
    .select({ batchId: assessmentBatches.batchId })
    .from(assessmentBatches)
    .where(eq(assessmentBatches.assessmentId, assessmentId));
  return rows.map((row) => row.batchId);
}

async function deleteAssessment(id: string): Promise<boolean> {
  const [deleted] = await db
    .update(assessments)
    .set({ deletedAt: new Date() })
    .where(and(eq(assessments.id, id), isNull(assessments.deletedAt)))
    .returning({ id: assessments.id });
  return Boolean(deleted);
}

// --- Assessment sections ---
// Hard delete: no deleted_at column in schema.sql (lifecycle tied entirely
// to the parent assessment's ON DELETE CASCADE).

async function listAssessmentSections(assessmentId: string): Promise<AssessmentSection[]> {
  return db
    .select()
    .from(assessmentSections)
    .where(eq(assessmentSections.assessmentId, assessmentId))
    .orderBy(asc(assessmentSections.sectionOrder));
}

async function findAssessmentSectionById(id: string): Promise<AssessmentSection | undefined> {
  const [section] = await db
    .select()
    .from(assessmentSections)
    .where(eq(assessmentSections.id, id))
    .limit(1);
  return section;
}

export interface CreateAssessmentSectionData {
  title: string;
  instructions?: string;
  sectionOrder?: number;
  timerMinutes?: number;
  passingMarks?: number;
  negativeMarking?: boolean;
  negativeMarkingValue?: number;
  shuffleQuestions?: boolean;
  selectionMode?: 'manual' | 'pool';
  createdBy: string | null;
}

async function createAssessmentSection(
  assessmentId: string,
  data: CreateAssessmentSectionData,
): Promise<AssessmentSection> {
  const [section] = await db
    .insert(assessmentSections)
    .values({
      assessmentId,
      title: data.title,
      instructions: data.instructions,
      sectionOrder: data.sectionOrder,
      timerMinutes: data.timerMinutes,
      passingMarks: data.passingMarks !== undefined ? String(data.passingMarks) : undefined,
      negativeMarking: data.negativeMarking,
      negativeMarkingValue:
        data.negativeMarkingValue !== undefined ? String(data.negativeMarkingValue) : undefined,
      shuffleQuestions: data.shuffleQuestions,
      selectionMode: data.selectionMode,
      createdBy: data.createdBy,
      updatedBy: data.createdBy,
    })
    .returning();
  return section;
}

export interface UpdateAssessmentSectionData {
  title?: string;
  instructions?: string | null;
  sectionOrder?: number;
  timerMinutes?: number | null;
  passingMarks?: number | null;
  negativeMarking?: boolean;
  negativeMarkingValue?: number | null;
  shuffleQuestions?: boolean;
  updatedBy?: string | null;
}

async function updateAssessmentSection(
  id: string,
  data: UpdateAssessmentSectionData,
): Promise<AssessmentSection | undefined> {
  const { passingMarks, negativeMarkingValue, ...rest } = data;
  const [updated] = await db
    .update(assessmentSections)
    .set({
      ...rest,
      ...(passingMarks !== undefined && {
        passingMarks: passingMarks === null ? null : String(passingMarks),
      }),
      ...(negativeMarkingValue !== undefined && {
        negativeMarkingValue: negativeMarkingValue === null ? null : String(negativeMarkingValue),
      }),
    })
    .where(eq(assessmentSections.id, id))
    .returning();
  return updated;
}

async function deleteAssessmentSection(id: string): Promise<boolean> {
  const deleted = await db
    .delete(assessmentSections)
    .where(eq(assessmentSections.id, id))
    .returning({ id: assessmentSections.id });
  return deleted.length > 0;
}

// --- Assessment questions (manual selection_mode) ---
// Hard delete: no deleted_at column, section_id is ON DELETE CASCADE.

async function listAssessmentQuestions(sectionId: string): Promise<AssessmentQuestion[]> {
  return db
    .select()
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentSectionId, sectionId))
    .orderBy(asc(assessmentQuestions.sortOrder));
}

// Joined with question_versions for the content a resolved section actually
// needs (question text, the version's own marks as the override fallback) —
// see assessments.service.ts's resolveSectionQuestions.
export interface AssessmentQuestionWithContent extends AssessmentQuestion {
  questionText: string;
  versionMarks: string;
}

async function listAssessmentQuestionsWithContent(
  sectionId: string,
): Promise<AssessmentQuestionWithContent[]> {
  const rows = await db
    .select({
      id: assessmentQuestions.id,
      assessmentSectionId: assessmentQuestions.assessmentSectionId,
      questionVersionId: assessmentQuestions.questionVersionId,
      marksOverride: assessmentQuestions.marksOverride,
      sortOrder: assessmentQuestions.sortOrder,
      questionText: questionVersions.questionText,
      versionMarks: questionVersions.marks,
    })
    .from(assessmentQuestions)
    .innerJoin(questionVersions, eq(questionVersions.id, assessmentQuestions.questionVersionId))
    .where(eq(assessmentQuestions.assessmentSectionId, sectionId))
    .orderBy(asc(assessmentQuestions.sortOrder));
  return rows;
}

async function findAssessmentQuestionById(id: string): Promise<AssessmentQuestion | undefined> {
  const [row] = await db
    .select()
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.id, id))
    .limit(1);
  return row;
}

export interface CreateAssessmentQuestionData {
  questionVersionId: string;
  marksOverride?: number;
  sortOrder?: number;
}

async function createAssessmentQuestion(
  sectionId: string,
  data: CreateAssessmentQuestionData,
): Promise<AssessmentQuestion> {
  try {
    const [row] = await db
      .insert(assessmentQuestions)
      .values({
        assessmentSectionId: sectionId,
        questionVersionId: data.questionVersionId,
        marksOverride: data.marksOverride !== undefined ? String(data.marksOverride) : undefined,
        sortOrder: data.sortOrder,
      })
      .returning();
    return row;
  } catch (error) {
    // 23505 = Postgres's unique_violation SQLSTATE — fires here when the
    // same question version is attached to the same section twice
    // (assessment_questions_assessment_section_id_question_version_key).
    // Drizzle wraps the raw postgres.js error as DrizzleQueryError with the
    // original PostgresError (which carries .code) on `.cause` — confirmed
    // directly against the actual 500 this used to surface as, not assumed.
    //
    // Every OTHER unique-constraint case in this codebase (e.g.
    // organization.service.ts's createCollege, against colleges.code) is
    // instead handled with a pre-check: look up by the unique field first,
    // throw ConflictError if found, before ever calling insert. That
    // pattern doesn't fully close this particular race either (two
    // concurrent attach requests can both pass the pre-check and then
    // collide at insert time), so this catches the constraint violation
    // directly at the one place it can actually happen, rather than
    // layering an equally-racy pre-check in the service on top of it. No
    // other repository in this codebase catches a raw driver error code
    // today — this is the first — but a repository is exactly where a raw
    // driver error must stop, per CLAUDE.md's rule that nothing but an
    // AppError subclass may leak out of a service.
    if (error instanceof Error && (error.cause as { code?: string } | undefined)?.code === '23505') {
      throw new ConflictError('This question is already attached to this section');
    }
    throw error;
  }
}

export interface UpdateAssessmentQuestionData {
  marksOverride?: number | null;
  sortOrder?: number;
}

async function updateAssessmentQuestion(
  id: string,
  data: UpdateAssessmentQuestionData,
): Promise<AssessmentQuestion | undefined> {
  const { marksOverride, ...rest } = data;
  const [updated] = await db
    .update(assessmentQuestions)
    .set(
      marksOverride !== undefined
        ? { ...rest, marksOverride: marksOverride === null ? null : String(marksOverride) }
        : rest,
    )
    .where(eq(assessmentQuestions.id, id))
    .returning();
  return updated;
}

async function deleteAssessmentQuestion(id: string): Promise<boolean> {
  const deleted = await db
    .delete(assessmentQuestions)
    .where(eq(assessmentQuestions.id, id))
    .returning({ id: assessmentQuestions.id });
  return deleted.length > 0;
}

// --- Assessment section pools (pool selection_mode) ---
// Hard delete: no deleted_at column, section_id is ON DELETE CASCADE.

async function listAssessmentSectionPools(sectionId: string): Promise<AssessmentSectionPool[]> {
  return db
    .select()
    .from(assessmentSectionPools)
    .where(eq(assessmentSectionPools.assessmentSectionId, sectionId))
    .orderBy(asc(assessmentSectionPools.createdAt));
}

async function findAssessmentSectionPoolById(
  id: string,
): Promise<AssessmentSectionPool | undefined> {
  const [row] = await db
    .select()
    .from(assessmentSectionPools)
    .where(eq(assessmentSectionPools.id, id))
    .limit(1);
  return row;
}

async function createAssessmentSectionPool(
  sectionId: string,
  questionPoolId: string,
): Promise<AssessmentSectionPool> {
  const [row] = await db
    .insert(assessmentSectionPools)
    .values({ assessmentSectionId: sectionId, questionPoolId })
    .returning();
  return row;
}

async function deleteAssessmentSectionPool(id: string): Promise<boolean> {
  const deleted = await db
    .delete(assessmentSectionPools)
    .where(eq(assessmentSectionPools.id, id))
    .returning({ id: assessmentSectionPools.id });
  return deleted.length > 0;
}

export interface PoolUsageRow {
  assessmentId: string;
  assessmentTitle: string;
}

// item 10 tier 3a — reverse lookup: every non-deleted assessment currently
// referencing this pool via ANY of its sections (assessment_section_pools
// -> assessment_sections -> assessments). Backs PoolDetailPage's delete
// guard — see assessments.schema.ts's poolUsageParamsSchema comment for the
// full "why this needs to exist at all" reasoning. selectDistinct on the
// assessment (not the section) since the same assessment could attach this
// pool to more than one section — a caller wants "which assessments", not
// "how many section-pool links."
async function listAssessmentsUsingPool(poolId: string): Promise<PoolUsageRow[]> {
  return db
    .selectDistinct({
      assessmentId: assessments.id,
      assessmentTitle: assessments.title,
    })
    .from(assessmentSectionPools)
    .innerJoin(
      assessmentSections,
      eq(assessmentSections.id, assessmentSectionPools.assessmentSectionId),
    )
    .innerJoin(
      assessments,
      and(eq(assessments.id, assessmentSections.assessmentId), isNull(assessments.deletedAt)),
    )
    .where(eq(assessmentSectionPools.questionPoolId, poolId));
}

// --- Assessment approval history ---
// Same transactional status+history pattern as question-bank's
// recordApprovalAction (Part 3) — see that file's comment for why the two
// writes must be atomic.

export interface RecordApprovalActionData {
  status: 'review' | 'draft' | 'approved' | 'scheduled' | 'live';
  action: 'submitted' | 'approved' | 'rejected' | 'scheduled' | 'published';
  performedBy: string | null;
  notes?: string;
  // Only ever populated by scheduleAssessment — this is the one action
  // whose own job is committing to a start/end window, so it writes these
  // two columns as part of its own status-transition update rather than
  // going through updateAssessment's normal PATCH path (which
  // assertAssessmentEditable blocks outside status='draft', and by the
  // time schedule is callable the assessment can never be 'draft' again).
  // See assessments.service.ts's scheduleAssessment.
  startAt?: Date;
  endAt?: Date;
}

export interface RecordApprovalActionResult {
  assessment: Assessment;
  historyEntry: AssessmentApprovalHistory;
}

async function recordApprovalAction(
  assessmentId: string,
  data: RecordApprovalActionData,
): Promise<RecordApprovalActionResult> {
  return db.transaction(async (tx) => {
    const [assessment] = await tx
      .update(assessments)
      .set({
        status: data.status,
        updatedBy: data.performedBy,
        startAt: data.startAt,
        endAt: data.endAt,
      })
      .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)))
      .returning();

    const [historyEntry] = await tx
      .insert(assessmentApprovalHistory)
      .values({
        assessmentId,
        action: data.action,
        performedBy: data.performedBy,
        notes: data.notes,
      })
      .returning();

    return { assessment, historyEntry };
  });
}

export interface ListApprovalHistoryResult {
  items: AssessmentApprovalHistory[];
  total: number;
}

async function listApprovalHistory(
  assessmentId: string,
  page: number,
  pageSize: number,
): Promise<ListApprovalHistoryResult> {
  const offset = (page - 1) * pageSize;
  const where = eq(assessmentApprovalHistory.assessmentId, assessmentId);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(assessmentApprovalHistory)
      .where(where)
      .orderBy(desc(assessmentApprovalHistory.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(assessmentApprovalHistory).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

export const assessmentsRepository = {
  listAssessments,
  listAvailableAssessments,
  findAssessmentById,
  createAssessmentWithBatches,
  updateAssessment,
  replaceAssessmentBatches,
  listAssessmentBatchIds,
  deleteAssessment,
  listAssessmentSections,
  findAssessmentSectionById,
  createAssessmentSection,
  updateAssessmentSection,
  deleteAssessmentSection,
  listAssessmentQuestions,
  listAssessmentQuestionsWithContent,
  findAssessmentQuestionById,
  createAssessmentQuestion,
  updateAssessmentQuestion,
  deleteAssessmentQuestion,
  listAssessmentSectionPools,
  findAssessmentSectionPoolById,
  createAssessmentSectionPool,
  deleteAssessmentSectionPool,
  listAssessmentsUsingPool,
  recordApprovalAction,
  listApprovalHistory,
};
