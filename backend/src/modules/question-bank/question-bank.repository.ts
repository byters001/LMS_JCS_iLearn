import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
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

  const [options, images] = await Promise.all([
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
  ]);

  return { ...version, options, images };
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

export interface CreateQuestionData {
  categoryId?: string | null;
  type: 'mcq' | 'coding' | 'psychometric';
  difficulty: 'easy' | 'medium' | 'hard';
  collegeId?: string | null;
  questionText: string;
  marks?: number;
  options?: CreateQuestionOptionData[];
  images?: CreateQuestionImageData[];
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

    const [updatedQuestion] = await tx
      .update(questions)
      .set({ currentVersionId: version.id })
      .where(eq(questions.id, question.id))
      .returning();

    return {
      question: updatedQuestion,
      version: { ...version, options, images },
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

    return { ...version, options, images };
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
};
