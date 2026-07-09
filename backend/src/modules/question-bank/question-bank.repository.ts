import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  codingQuestionDetails,
  codingTestCases,
  psychometricDetails,
  psychometricOptions,
  questionCategories,
  questionImages,
  questionOptions,
  questionTagMap,
  questionTags,
  questionTopicMap,
  questionTopics,
  questionVersions,
  questions,
} from '../../db/schema/question-bank.schema';
import type {
  CodingQuestionDetails,
  CodingTestCase,
  PsychometricDetails,
  PsychometricOption,
  Question,
  QuestionCategory,
  QuestionTag,
  QuestionTopic,
  QuestionVersion,
} from '../../db/types';
import type { QuestionVersionWithContent } from './question-bank.types';

// --- Question categories ---
// Hard delete: no deleted_at column in schema.sql. Safe to hard-delete —
// questions.category_id, question_topics.category_id, and
// question_categories.parent_category_id (self-referencing) are all
// ON DELETE SET NULL; nothing RESTRICTs the delete.

export interface ListQuestionCategoriesParams {
  parentCategoryId?: string;
  page: number;
  pageSize: number;
}

export interface ListQuestionCategoriesResult {
  items: QuestionCategory[];
  total: number;
}

async function listQuestionCategories(
  params: ListQuestionCategoriesParams,
): Promise<ListQuestionCategoriesResult> {
  const { parentCategoryId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = parentCategoryId
    ? eq(questionCategories.parentCategoryId, parentCategoryId)
    : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(questionCategories)
      .where(where)
      .orderBy(asc(questionCategories.name))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(questionCategories).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findQuestionCategoryById(id: string): Promise<QuestionCategory | undefined> {
  const [category] = await db
    .select()
    .from(questionCategories)
    .where(eq(questionCategories.id, id))
    .limit(1);
  return category;
}

export interface CreateQuestionCategoryData {
  name: string;
  parentCategoryId?: string | null;
}

async function createQuestionCategory(
  data: CreateQuestionCategoryData,
): Promise<QuestionCategory> {
  const [category] = await db.insert(questionCategories).values(data).returning();
  return category;
}

export interface UpdateQuestionCategoryData {
  name?: string;
  parentCategoryId?: string | null;
}

async function updateQuestionCategory(
  id: string,
  data: UpdateQuestionCategoryData,
): Promise<QuestionCategory | undefined> {
  const [updated] = await db
    .update(questionCategories)
    .set(data)
    .where(eq(questionCategories.id, id))
    .returning();
  return updated;
}

async function deleteQuestionCategory(id: string): Promise<boolean> {
  const deleted = await db
    .delete(questionCategories)
    .where(eq(questionCategories.id, id))
    .returning({ id: questionCategories.id });
  return deleted.length > 0;
}

// --- Question topics ---
// Hard delete: same reasoning as categories — no deleted_at, and
// question_topic_map.topic_id is ON DELETE CASCADE (nothing RESTRICTs it).

export interface ListQuestionTopicsParams {
  categoryId?: string;
  page: number;
  pageSize: number;
}

export interface ListQuestionTopicsResult {
  items: QuestionTopic[];
  total: number;
}

async function listQuestionTopics(
  params: ListQuestionTopicsParams,
): Promise<ListQuestionTopicsResult> {
  const { categoryId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = categoryId ? eq(questionTopics.categoryId, categoryId) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(questionTopics)
      .where(where)
      .orderBy(asc(questionTopics.name))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(questionTopics).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findQuestionTopicById(id: string): Promise<QuestionTopic | undefined> {
  const [topic] = await db
    .select()
    .from(questionTopics)
    .where(eq(questionTopics.id, id))
    .limit(1);
  return topic;
}

export interface CreateQuestionTopicData {
  name: string;
  categoryId?: string | null;
}

async function createQuestionTopic(data: CreateQuestionTopicData): Promise<QuestionTopic> {
  const [topic] = await db.insert(questionTopics).values(data).returning();
  return topic;
}

export interface UpdateQuestionTopicData {
  name?: string;
  categoryId?: string | null;
}

async function updateQuestionTopic(
  id: string,
  data: UpdateQuestionTopicData,
): Promise<QuestionTopic | undefined> {
  const [updated] = await db
    .update(questionTopics)
    .set(data)
    .where(eq(questionTopics.id, id))
    .returning();
  return updated;
}

async function deleteQuestionTopic(id: string): Promise<boolean> {
  const deleted = await db
    .delete(questionTopics)
    .where(eq(questionTopics.id, id))
    .returning({ id: questionTopics.id });
  return deleted.length > 0;
}

// --- Question tags ---
// Hard delete: same reasoning — no deleted_at, question_tag_map.tag_id is
// ON DELETE CASCADE. Most minimal table in the schema (just id + unique
// name), so create/update take a bare string rather than a data object.

export interface ListQuestionTagsParams {
  page: number;
  pageSize: number;
}

export interface ListQuestionTagsResult {
  items: QuestionTag[];
  total: number;
}

async function listQuestionTags(params: ListQuestionTagsParams): Promise<ListQuestionTagsResult> {
  const { page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  const [items, totalRows] = await Promise.all([
    db.select().from(questionTags).orderBy(asc(questionTags.name)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(questionTags),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findQuestionTagById(id: string): Promise<QuestionTag | undefined> {
  const [tag] = await db.select().from(questionTags).where(eq(questionTags.id, id)).limit(1);
  return tag;
}

// Pre-insert uniqueness check (question_tags.name is UNIQUE in schema.sql).
async function findQuestionTagByName(name: string): Promise<QuestionTag | undefined> {
  const [tag] = await db.select().from(questionTags).where(eq(questionTags.name, name)).limit(1);
  return tag;
}

async function createQuestionTag(name: string): Promise<QuestionTag> {
  const [tag] = await db.insert(questionTags).values({ name }).returning();
  return tag;
}

async function updateQuestionTag(id: string, name: string): Promise<QuestionTag | undefined> {
  const [updated] = await db
    .update(questionTags)
    .set({ name })
    .where(eq(questionTags.id, id))
    .returning();
  return updated;
}

async function deleteQuestionTag(id: string): Promise<boolean> {
  const deleted = await db
    .delete(questionTags)
    .where(eq(questionTags.id, id))
    .returning({ id: questionTags.id });
  return deleted.length > 0;
}

// --- Questions / question_versions (the versioned entity) ---
// Soft delete on questions (deleted_at exists). question_versions has no
// deleted_at/updated_at at all — append-only history, never mutated or
// deleted independently once created; see question-bank.service.ts for the
// full create-vs-new-version reasoning.

export interface ListQuestionsParams {
  categoryId?: string;
  type?: 'mcq' | 'coding' | 'psychometric';
  difficulty?: 'easy' | 'medium' | 'hard';
  collegeId?: string;
  status?: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';
  page: number;
  pageSize: number;
}

export interface ListQuestionsResult {
  items: Question[];
  total: number;
}

function buildQuestionsWhere(params: Omit<ListQuestionsParams, 'page' | 'pageSize'>) {
  const conditions = [isNull(questions.deletedAt)];
  if (params.categoryId) conditions.push(eq(questions.categoryId, params.categoryId));
  if (params.type) conditions.push(eq(questions.type, params.type));
  if (params.difficulty) conditions.push(eq(questions.difficulty, params.difficulty));
  if (params.collegeId) conditions.push(eq(questions.collegeId, params.collegeId));
  if (params.status) conditions.push(eq(questions.status, params.status));
  return and(...conditions);
}

async function listQuestions(params: ListQuestionsParams): Promise<ListQuestionsResult> {
  const { page, pageSize, ...filters } = params;
  const offset = (page - 1) * pageSize;
  const where = buildQuestionsWhere(filters);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(questions)
      .where(where)
      .orderBy(desc(questions.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(questions).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findQuestionById(id: string): Promise<Question | undefined> {
  const [question] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, id), isNull(questions.deletedAt)))
    .limit(1);
  return question;
}

async function findQuestionVersionContentById(
  versionId: string,
): Promise<QuestionVersionWithContent | undefined> {
  const [version] = await db
    .select()
    .from(questionVersions)
    .where(eq(questionVersions.id, versionId))
    .limit(1);
  if (!version) return undefined;

  // All four type-specific tables are queried regardless of the parent
  // question's type — cheap (indexed, version-scoped, normally empty for a
  // non-matching type) and avoids an extra round-trip to look up
  // questions.type first just to decide which queries to skip.
  const [options, images, codingDetailsRow, testCases, psychometricDetailsRow, psychOptions] =
    await Promise.all([
      db
        .select()
        .from(questionOptions)
        .where(eq(questionOptions.questionVersionId, versionId))
        .orderBy(asc(questionOptions.sortOrder)),
      db
        .select()
        .from(questionImages)
        .where(eq(questionImages.questionVersionId, versionId))
        .orderBy(asc(questionImages.sortOrder)),
      db
        .select()
        .from(codingQuestionDetails)
        .where(eq(codingQuestionDetails.questionVersionId, versionId))
        .limit(1),
      db
        .select()
        .from(codingTestCases)
        .where(eq(codingTestCases.questionVersionId, versionId))
        .orderBy(asc(codingTestCases.sortOrder)),
      db
        .select()
        .from(psychometricDetails)
        .where(eq(psychometricDetails.questionVersionId, versionId))
        .limit(1),
      db
        .select()
        .from(psychometricOptions)
        .where(eq(psychometricOptions.questionVersionId, versionId))
        .orderBy(asc(psychometricOptions.sortOrder)),
    ]);

  return {
    ...version,
    options,
    images,
    codingDetails: codingDetailsRow[0] ?? null,
    testCases,
    psychometricDetails: psychometricDetailsRow[0] ?? null,
    psychometricOptions: psychOptions,
  };
}

export interface CreateQuestionOptionData {
  optionText: string;
  imageUrl?: string | null;
  isCorrect?: boolean;
  sortOrder?: number;
}

export interface CreateQuestionImageData {
  imageUrl: string;
  caption?: string | null;
  sortOrder?: number;
}

export interface CreateCodingQuestionDetailsData {
  problemStatement: string;
  inputFormat?: string | null;
  outputFormat?: string | null;
  constraints?: string | null;
  timeLimitMs?: number;
  memoryLimitKb?: number;
  supportedLanguages?: string[];
}

export interface CreateCodingTestCaseData {
  input?: string | null;
  expectedOutput?: string | null;
  isHidden?: boolean;
  points?: number;
  sortOrder?: number;
}

export interface CreatePsychometricDetailsData {
  traitCategory?: string | null;
  scaleType?: string;
}

export interface CreatePsychometricOptionData {
  optionText: string;
  traitWeight?: number;
  sortOrder?: number;
}

export interface CreateQuestionData {
  categoryId?: string | null;
  type: 'mcq' | 'coding' | 'psychometric';
  difficulty: 'easy' | 'medium' | 'hard';
  collegeId?: string | null;
  questionText: string;
  marks?: number;
  options?: CreateQuestionOptionData[];
  images?: CreateQuestionImageData[];
  // Type-specific — service.ts validates these against `type` before
  // calling in (e.g. codingDetails only allowed when type === 'coding').
  // The repository trusts that check and doesn't re-validate.
  codingDetails?: CreateCodingQuestionDetailsData;
  testCases?: CreateCodingTestCaseData[];
  psychometricDetails?: CreatePsychometricDetailsData;
  psychometricOptions?: CreatePsychometricOptionData[];
  topicIds?: string[];
  tagIds?: string[];
  createdBy: string | null;
}

// Transactionally creates the questions row, its first question_versions
// row (version_number=1, is_active_version=true), version-scoped
// options/images, question-level topic/tag map rows, then points
// questions.current_version_id at the new version — one atomic unit, since
// question_text is NOT NULL on question_versions and a question can't exist
// without content.
async function createQuestionWithVersion(
  data: CreateQuestionData,
): Promise<{ question: Question; version: QuestionVersionWithContent }> {
  return db.transaction(async (tx) => {
    const [question] = await tx
      .insert(questions)
      .values({
        categoryId: data.categoryId,
        type: data.type,
        difficulty: data.difficulty,
        collegeId: data.collegeId,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
      })
      .returning();

    const [version] = await tx
      .insert(questionVersions)
      .values({
        questionId: question.id,
        versionNumber: 1,
        questionText: data.questionText,
        marks: data.marks !== undefined ? String(data.marks) : undefined,
        isActiveVersion: true,
        createdBy: data.createdBy,
      })
      .returning();

    const [options, images] = await Promise.all([
      data.options && data.options.length > 0
        ? tx
            .insert(questionOptions)
            .values(
              data.options.map((option) => ({
                questionVersionId: version.id,
                optionText: option.optionText,
                imageUrl: option.imageUrl,
                isCorrect: option.isCorrect,
                sortOrder: option.sortOrder,
              })),
            )
            .returning()
        : Promise.resolve([]),
      data.images && data.images.length > 0
        ? tx
            .insert(questionImages)
            .values(
              data.images.map((image) => ({
                questionVersionId: version.id,
                imageUrl: image.imageUrl,
                caption: image.caption,
                sortOrder: image.sortOrder,
              })),
            )
            .returning()
        : Promise.resolve([]),
    ]);

    if (data.topicIds && data.topicIds.length > 0) {
      await tx
        .insert(questionTopicMap)
        .values(data.topicIds.map((topicId) => ({ questionId: question.id, topicId })));
    }
    if (data.tagIds && data.tagIds.length > 0) {
      await tx
        .insert(questionTagMap)
        .values(data.tagIds.map((tagId) => ({ questionId: question.id, tagId })));
    }

    const [codingDetailsRow, testCases, psychometricDetailsRow, psychOptionsRows] =
      await Promise.all([
        data.codingDetails
          ? tx
              .insert(codingQuestionDetails)
              .values({ questionVersionId: version.id, ...data.codingDetails })
              .returning()
          : Promise.resolve([]),
        data.testCases && data.testCases.length > 0
          ? tx
              .insert(codingTestCases)
              .values(
                data.testCases.map((testCase) => ({
                  questionVersionId: version.id,
                  input: testCase.input,
                  expectedOutput: testCase.expectedOutput,
                  isHidden: testCase.isHidden,
                  points: testCase.points !== undefined ? String(testCase.points) : undefined,
                  sortOrder: testCase.sortOrder,
                })),
              )
              .returning()
          : Promise.resolve([]),
        data.psychometricDetails
          ? tx
              .insert(psychometricDetails)
              .values({ questionVersionId: version.id, ...data.psychometricDetails })
              .returning()
          : Promise.resolve([]),
        data.psychometricOptions && data.psychometricOptions.length > 0
          ? tx
              .insert(psychometricOptions)
              .values(
                data.psychometricOptions.map((option) => ({
                  questionVersionId: version.id,
                  optionText: option.optionText,
                  traitWeight:
                    option.traitWeight !== undefined ? String(option.traitWeight) : undefined,
                  sortOrder: option.sortOrder,
                })),
              )
              .returning()
          : Promise.resolve([]),
      ]);

    const [updatedQuestion] = await tx
      .update(questions)
      .set({ currentVersionId: version.id })
      .where(eq(questions.id, question.id))
      .returning();

    return {
      question: updatedQuestion,
      version: {
        ...version,
        options,
        images,
        codingDetails: codingDetailsRow[0] ?? null,
        testCases,
        psychometricDetails: psychometricDetailsRow[0] ?? null,
        psychometricOptions: psychOptionsRows,
      },
    };
  });
}

// categoryId/collegeId are nullable (clearing them back to "uncategorized"/
// "global" is a legitimate edit); type is deliberately excluded — not part
// of the update surface anywhere in this schema.sql-driven design, since
// changing mcq -> coding on an existing question would orphan its
// version-scoped options/coding-details.
export interface UpdateQuestionData {
  categoryId?: string | null;
  difficulty?: 'easy' | 'medium' | 'hard';
  collegeId?: string | null;
  updatedBy?: string | null;
}

async function updateQuestion(
  id: string,
  data: UpdateQuestionData,
): Promise<Question | undefined> {
  const [updated] = await db
    .update(questions)
    .set(data)
    .where(and(eq(questions.id, id), isNull(questions.deletedAt)))
    .returning();
  return updated;
}

async function deleteQuestion(id: string): Promise<boolean> {
  const [deleted] = await db
    .update(questions)
    .set({ deletedAt: new Date() })
    .where(and(eq(questions.id, id), isNull(questions.deletedAt)))
    .returning({ id: questions.id });
  return Boolean(deleted);
}

async function listQuestionVersions(questionId: string): Promise<QuestionVersion[]> {
  return db
    .select()
    .from(questionVersions)
    .where(eq(questionVersions.questionId, questionId))
    .orderBy(desc(questionVersions.versionNumber));
}

async function findQuestionVersionByQuestionAndId(
  questionId: string,
  versionId: string,
): Promise<QuestionVersionWithContent | undefined> {
  const content = await findQuestionVersionContentById(versionId);
  if (!content || content.questionId !== questionId) return undefined;
  return content;
}

export interface CreateQuestionVersionData {
  questionText: string;
  marks?: number;
  options?: CreateQuestionOptionData[];
  images?: CreateQuestionImageData[];
  // Same type-vs-payload validation contract as CreateQuestionData — see
  // question-bank.service.ts.
  codingDetails?: CreateCodingQuestionDetailsData;
  testCases?: CreateCodingTestCaseData[];
  psychometricDetails?: CreatePsychometricDetailsData;
  psychometricOptions?: CreatePsychometricOptionData[];
  createdBy: string | null;
}

// New version rows are never marked active on creation — activation is a
// separate, explicit step (activateQuestionVersion) so a draft revision can
// be staged before it becomes the version assessments would pick up.
async function createQuestionVersion(
  questionId: string,
  data: CreateQuestionVersionData,
): Promise<QuestionVersionWithContent> {
  return db.transaction(async (tx) => {
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${questionVersions.versionNumber}), 0)` })
      .from(questionVersions)
      .where(eq(questionVersions.questionId, questionId));
    const nextVersionNumber = Number(max ?? 0) + 1;

    const [version] = await tx
      .insert(questionVersions)
      .values({
        questionId,
        versionNumber: nextVersionNumber,
        questionText: data.questionText,
        marks: data.marks !== undefined ? String(data.marks) : undefined,
        isActiveVersion: false,
        createdBy: data.createdBy,
      })
      .returning();

    const [options, images] = await Promise.all([
      data.options && data.options.length > 0
        ? tx
            .insert(questionOptions)
            .values(
              data.options.map((option) => ({
                questionVersionId: version.id,
                optionText: option.optionText,
                imageUrl: option.imageUrl,
                isCorrect: option.isCorrect,
                sortOrder: option.sortOrder,
              })),
            )
            .returning()
        : Promise.resolve([]),
      data.images && data.images.length > 0
        ? tx
            .insert(questionImages)
            .values(
              data.images.map((image) => ({
                questionVersionId: version.id,
                imageUrl: image.imageUrl,
                caption: image.caption,
                sortOrder: image.sortOrder,
              })),
            )
            .returning()
        : Promise.resolve([]),
    ]);

    const [codingDetailsRow, testCases, psychometricDetailsRow, psychOptionsRows] =
      await Promise.all([
        data.codingDetails
          ? tx
              .insert(codingQuestionDetails)
              .values({ questionVersionId: version.id, ...data.codingDetails })
              .returning()
          : Promise.resolve([]),
        data.testCases && data.testCases.length > 0
          ? tx
              .insert(codingTestCases)
              .values(
                data.testCases.map((testCase) => ({
                  questionVersionId: version.id,
                  input: testCase.input,
                  expectedOutput: testCase.expectedOutput,
                  isHidden: testCase.isHidden,
                  points: testCase.points !== undefined ? String(testCase.points) : undefined,
                  sortOrder: testCase.sortOrder,
                })),
              )
              .returning()
          : Promise.resolve([]),
        data.psychometricDetails
          ? tx
              .insert(psychometricDetails)
              .values({ questionVersionId: version.id, ...data.psychometricDetails })
              .returning()
          : Promise.resolve([]),
        data.psychometricOptions && data.psychometricOptions.length > 0
          ? tx
              .insert(psychometricOptions)
              .values(
                data.psychometricOptions.map((option) => ({
                  questionVersionId: version.id,
                  optionText: option.optionText,
                  traitWeight:
                    option.traitWeight !== undefined ? String(option.traitWeight) : undefined,
                  sortOrder: option.sortOrder,
                })),
              )
              .returning()
          : Promise.resolve([]),
      ]);

    return {
      ...version,
      options,
      images,
      codingDetails: codingDetailsRow[0] ?? null,
      testCases,
      psychometricDetails: psychometricDetailsRow[0] ?? null,
      psychometricOptions: psychOptionsRows,
    };
  });
}

// Atomically: unset the previously active version for this question (if
// any), mark the target version active, point questions.current_version_id
// at it. is_active_version and current_version_id encode the same fact —
// see question-bank.service.ts — so they're always changed together, never
// independently.
async function activateQuestionVersion(
  questionId: string,
  versionId: string,
): Promise<Question | undefined> {
  return db.transaction(async (tx) => {
    await tx
      .update(questionVersions)
      .set({ isActiveVersion: false })
      .where(
        and(
          eq(questionVersions.questionId, questionId),
          eq(questionVersions.isActiveVersion, true),
        ),
      );

    await tx
      .update(questionVersions)
      .set({ isActiveVersion: true })
      .where(
        and(eq(questionVersions.id, versionId), eq(questionVersions.questionId, questionId)),
      );

    const [updated] = await tx
      .update(questions)
      .set({ currentVersionId: versionId })
      .where(and(eq(questions.id, questionId), isNull(questions.deletedAt)))
      .returning();

    return updated;
  });
}

// --- Coding question details (1:1 per version) ---
// Dedicated post-creation CRUD, in addition to the bundled-at-creation
// inserts above — a version can be created bare and have its coding
// content filled in/refined afterwards. See question-bank.service.ts for
// the type-match and version-immutability guards that gate these.

async function findCodingQuestionDetailsByVersionId(
  questionVersionId: string,
): Promise<CodingQuestionDetails | undefined> {
  const [row] = await db
    .select()
    .from(codingQuestionDetails)
    .where(eq(codingQuestionDetails.questionVersionId, questionVersionId))
    .limit(1);
  return row;
}

async function createCodingQuestionDetails(
  questionVersionId: string,
  data: CreateCodingQuestionDetailsData,
): Promise<CodingQuestionDetails> {
  const [row] = await db
    .insert(codingQuestionDetails)
    .values({ questionVersionId, ...data })
    .returning();
  return row;
}

export interface UpdateCodingQuestionDetailsData {
  problemStatement?: string;
  inputFormat?: string | null;
  outputFormat?: string | null;
  constraints?: string | null;
  timeLimitMs?: number;
  memoryLimitKb?: number;
  supportedLanguages?: string[];
}

async function updateCodingQuestionDetails(
  questionVersionId: string,
  data: UpdateCodingQuestionDetailsData,
): Promise<CodingQuestionDetails | undefined> {
  const [updated] = await db
    .update(codingQuestionDetails)
    .set(data)
    .where(eq(codingQuestionDetails.questionVersionId, questionVersionId))
    .returning();
  return updated;
}

async function deleteCodingQuestionDetails(questionVersionId: string): Promise<boolean> {
  const deleted = await db
    .delete(codingQuestionDetails)
    .where(eq(codingQuestionDetails.questionVersionId, questionVersionId))
    .returning({ id: codingQuestionDetails.id });
  return deleted.length > 0;
}

// --- Coding test cases (1:many per version) ---

async function listCodingTestCases(questionVersionId: string): Promise<CodingTestCase[]> {
  return db
    .select()
    .from(codingTestCases)
    .where(eq(codingTestCases.questionVersionId, questionVersionId))
    .orderBy(asc(codingTestCases.sortOrder));
}

async function findCodingTestCaseById(id: string): Promise<CodingTestCase | undefined> {
  const [row] = await db
    .select()
    .from(codingTestCases)
    .where(eq(codingTestCases.id, id))
    .limit(1);
  return row;
}

async function createCodingTestCase(
  questionVersionId: string,
  data: CreateCodingTestCaseData,
): Promise<CodingTestCase> {
  const [row] = await db
    .insert(codingTestCases)
    .values({
      questionVersionId,
      input: data.input,
      expectedOutput: data.expectedOutput,
      isHidden: data.isHidden,
      points: data.points !== undefined ? String(data.points) : undefined,
      sortOrder: data.sortOrder,
    })
    .returning();
  return row;
}

export interface UpdateCodingTestCaseData {
  input?: string | null;
  expectedOutput?: string | null;
  isHidden?: boolean;
  points?: number;
  sortOrder?: number;
}

async function updateCodingTestCase(
  id: string,
  data: UpdateCodingTestCaseData,
): Promise<CodingTestCase | undefined> {
  const { points, ...rest } = data;
  const [updated] = await db
    .update(codingTestCases)
    .set(points !== undefined ? { ...rest, points: String(points) } : rest)
    .where(eq(codingTestCases.id, id))
    .returning();
  return updated;
}

async function deleteCodingTestCase(id: string): Promise<boolean> {
  const deleted = await db
    .delete(codingTestCases)
    .where(eq(codingTestCases.id, id))
    .returning({ id: codingTestCases.id });
  return deleted.length > 0;
}

// --- Psychometric details (1:1 per version) ---

async function findPsychometricDetailsByVersionId(
  questionVersionId: string,
): Promise<PsychometricDetails | undefined> {
  const [row] = await db
    .select()
    .from(psychometricDetails)
    .where(eq(psychometricDetails.questionVersionId, questionVersionId))
    .limit(1);
  return row;
}

async function createPsychometricDetails(
  questionVersionId: string,
  data: CreatePsychometricDetailsData,
): Promise<PsychometricDetails> {
  const [row] = await db
    .insert(psychometricDetails)
    .values({ questionVersionId, ...data })
    .returning();
  return row;
}

export interface UpdatePsychometricDetailsData {
  traitCategory?: string | null;
  scaleType?: string;
}

async function updatePsychometricDetails(
  questionVersionId: string,
  data: UpdatePsychometricDetailsData,
): Promise<PsychometricDetails | undefined> {
  const [updated] = await db
    .update(psychometricDetails)
    .set(data)
    .where(eq(psychometricDetails.questionVersionId, questionVersionId))
    .returning();
  return updated;
}

async function deletePsychometricDetails(questionVersionId: string): Promise<boolean> {
  const deleted = await db
    .delete(psychometricDetails)
    .where(eq(psychometricDetails.questionVersionId, questionVersionId))
    .returning({ id: psychometricDetails.id });
  return deleted.length > 0;
}

// --- Psychometric options (1:many per version) ---

async function listPsychometricOptions(questionVersionId: string): Promise<PsychometricOption[]> {
  return db
    .select()
    .from(psychometricOptions)
    .where(eq(psychometricOptions.questionVersionId, questionVersionId))
    .orderBy(asc(psychometricOptions.sortOrder));
}

async function findPsychometricOptionById(id: string): Promise<PsychometricOption | undefined> {
  const [row] = await db
    .select()
    .from(psychometricOptions)
    .where(eq(psychometricOptions.id, id))
    .limit(1);
  return row;
}

async function createPsychometricOption(
  questionVersionId: string,
  data: CreatePsychometricOptionData,
): Promise<PsychometricOption> {
  const [row] = await db
    .insert(psychometricOptions)
    .values({
      questionVersionId,
      optionText: data.optionText,
      traitWeight: data.traitWeight !== undefined ? String(data.traitWeight) : undefined,
      sortOrder: data.sortOrder,
    })
    .returning();
  return row;
}

export interface UpdatePsychometricOptionData {
  optionText?: string;
  traitWeight?: number;
  sortOrder?: number;
}

async function updatePsychometricOption(
  id: string,
  data: UpdatePsychometricOptionData,
): Promise<PsychometricOption | undefined> {
  const { traitWeight, ...rest } = data;
  const [updated] = await db
    .update(psychometricOptions)
    .set(traitWeight !== undefined ? { ...rest, traitWeight: String(traitWeight) } : rest)
    .where(eq(psychometricOptions.id, id))
    .returning();
  return updated;
}

async function deletePsychometricOption(id: string): Promise<boolean> {
  const deleted = await db
    .delete(psychometricOptions)
    .where(eq(psychometricOptions.id, id))
    .returning({ id: psychometricOptions.id });
  return deleted.length > 0;
}

export const questionBankRepository = {
  listQuestionCategories,
  findQuestionCategoryById,
  createQuestionCategory,
  updateQuestionCategory,
  deleteQuestionCategory,
  listQuestionTopics,
  findQuestionTopicById,
  createQuestionTopic,
  updateQuestionTopic,
  deleteQuestionTopic,
  listQuestionTags,
  findQuestionTagById,
  findQuestionTagByName,
  createQuestionTag,
  updateQuestionTag,
  deleteQuestionTag,
  listQuestions,
  findQuestionById,
  findQuestionVersionContentById,
  createQuestionWithVersion,
  updateQuestion,
  deleteQuestion,
  listQuestionVersions,
  findQuestionVersionByQuestionAndId,
  createQuestionVersion,
  activateQuestionVersion,
  findCodingQuestionDetailsByVersionId,
  createCodingQuestionDetails,
  updateCodingQuestionDetails,
  deleteCodingQuestionDetails,
  listCodingTestCases,
  findCodingTestCaseById,
  createCodingTestCase,
  updateCodingTestCase,
  deleteCodingTestCase,
  findPsychometricDetailsByVersionId,
  createPsychometricDetails,
  updatePsychometricDetails,
  deletePsychometricDetails,
  listPsychometricOptions,
  findPsychometricOptionById,
  createPsychometricOption,
  updatePsychometricOption,
  deletePsychometricOption,
};
