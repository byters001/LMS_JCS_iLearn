import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  assessmentApprovalHistory,
  assessmentBatches,
  assessmentQuestions,
  assessmentSectionPools,
  assessmentSections,
  assessments,
} from '../../db/schema/assessments.schema';
import { questionVersions } from '../../db/schema/question-bank.schema';
import type {
  Assessment,
  AssessmentApprovalHistory,
  AssessmentQuestion,
  AssessmentSection,
  AssessmentSectionPool,
} from '../../db/types';

// --- Assessments ---
// Soft delete: deleted_at exists in schema.sql, same treatment as questions/
// question_pools.

export interface ListAssessmentsParams {
  trainingSessionId?: string;
  status?: 'draft' | 'review' | 'approved' | 'scheduled' | 'live' | 'completed' | 'archived';
  testCategory?: 'mcq' | 'coding' | 'psychometric' | 'mixed';
  page: number;
  pageSize: number;
}

export interface ListAssessmentsResult {
  items: Assessment[];
  total: number;
}

function buildAssessmentsWhere(params: Omit<ListAssessmentsParams, 'page' | 'pageSize'>) {
  const conditions = [isNull(assessments.deletedAt)];
  if (params.trainingSessionId) {
    conditions.push(eq(assessments.trainingSessionId, params.trainingSessionId));
  }
  if (params.status) conditions.push(eq(assessments.status, params.status));
  if (params.testCategory) conditions.push(eq(assessments.testCategory, params.testCategory));
  return and(...conditions);
}

async function listAssessments(params: ListAssessmentsParams): Promise<ListAssessmentsResult> {
  const { page, pageSize, ...filters } = params;
  const offset = (page - 1) * pageSize;
  const where = buildAssessmentsWhere(filters);

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
async function listAvailableAssessments(
  params: ListAvailableAssessmentsParams,
): Promise<ListAssessmentsResult> {
  const { batchIds, status, page, pageSize } = params;
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

  const [items, totalRows] = await Promise.all([
    db
      .selectDistinct({ assessment: assessments })
      .from(assessments)
      .innerJoin(assessmentBatches, eq(assessmentBatches.assessmentId, assessments.id))
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
    items: items.map((row) => row.assessment),
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
  trainingSessionId: string;
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
  recordApprovalAction,
  listApprovalHistory,
};
