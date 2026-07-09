import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema';
import { colleges } from './organization.schema';

// Names match schema.sql's CREATE TYPE statements exactly — these types
// already exist in the real Postgres database.
export const questionTypeEnum = pgEnum('question_type_enum', ['mcq', 'coding', 'psychometric']);
export const difficultyEnum = pgEnum('difficulty_enum', ['easy', 'medium', 'hard']);
export const questionStatusEnum = pgEnum('question_status_enum', [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'archived',
]);

// --- Lookup tables: no updated_at, no deleted_at on any of these in
// schema.sql — hard delete is the only mechanism available (see
// question-bank.repository.ts for the FK-safety reasoning per table).

export const questionCategories = pgTable('question_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Self-referencing, ON DELETE SET NULL in schema.sql — deleting a parent
  // category orphans its children rather than cascading.
  parentCategoryId: uuid('parent_category_id').references(
    (): AnyPgColumn => questionCategories.id,
    { onDelete: 'set null' },
  ),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const questionTopics = pgTable(
  'question_topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => questionCategories.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index('idx_question_topics_category').on(table.categoryId),
  }),
);

// Most minimal table in this schema — just id + unique name, no
// created_at even.
export const questionTags = pgTable('question_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
});

// --- The versioned entity ---

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id').references(() => questionCategories.id, {
      onDelete: 'set null',
    }),
    type: questionTypeEnum('type').notNull(),
    difficulty: difficultyEnum('difficulty').notNull(),
    // NULL = global question bank, not scoped to any one college.
    collegeId: uuid('college_id').references(() => colleges.id, { onDelete: 'set null' }),
    status: questionStatusEnum('status').notNull().default('draft'),
    // References question_versions, defined further down this file.
    // schema.sql wires this via a separate ALTER TABLE after
    // question_versions exists (circular dependency); Drizzle handles the
    // same circularity via a lazy () => questionVersions.id callback,
    // exactly like identity.schema.ts's self-referencing users.created_by.
    currentVersionId: uuid('current_version_id').references(
      (): AnyPgColumn => questionVersions.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    categoryIdx: index('idx_questions_category')
      .on(table.categoryId)
      .where(sql`${table.deletedAt} IS NULL`),
    collegeIdx: index('idx_questions_college')
      .on(table.collegeId)
      .where(sql`${table.deletedAt} IS NULL`),
    statusIdx: index('idx_questions_status')
      .on(table.status)
      .where(sql`${table.deletedAt} IS NULL`),
    typeIdx: index('idx_questions_type')
      .on(table.type)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

// No updated_at, no deleted_at — versions are append-only/immutable once
// created; see question-bank.service.ts for how "edit" maps onto "create a
// new version" rather than mutating this table in place.
export const questionVersions = pgTable(
  'question_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    questionText: text('question_text').notNull(),
    marks: numeric('marks', { precision: 6, scale: 2 }).notNull().default('1'),
    isActiveVersion: boolean('is_active_version').notNull().default(false),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    questionVersionUnique: unique().on(table.questionId, table.versionNumber),
    // Partial unique index — DB-level guarantee that at most one version
    // per question can be active. Mirrors schema.sql's
    // idx_question_versions_one_active exactly. unique() has no .where()
    // in this drizzle-orm version (partial UNIQUE constraints aren't
    // supported that way); uniqueIndex() does support it.
    oneActiveIdx: uniqueIndex('idx_question_versions_one_active')
      .on(table.questionId)
      .where(sql`${table.isActiveVersion} = true`),
    questionIdx: index('idx_question_versions_question').on(table.questionId),
  }),
);

// Version-scoped content, not question-scoped — an MCQ option belongs to
// one specific revision of the question text. No lifecycle columns.
export const questionOptions = pgTable(
  'question_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'cascade' }),
    optionText: text('option_text').notNull(),
    imageUrl: text('image_url'),
    isCorrect: boolean('is_correct').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => ({
    versionIdx: index('idx_question_options_version').on(table.questionVersionId),
  }),
);

// Also version-scoped — illustrative images for a specific revision.
export const questionImages = pgTable(
  'question_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => ({
    versionIdx: index('idx_question_images_version').on(table.questionVersionId),
  }),
);

// Question-level (not version-level) taxonomy associations — pure join
// tables, no lifecycle columns.
export const questionTopicMap = pgTable(
  'question_topic_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => questionTopics.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    questionTopicUnique: unique().on(table.questionId, table.topicId),
  }),
);

export const questionTagMap = pgTable(
  'question_tag_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => questionTags.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    questionTagUnique: unique().on(table.questionId, table.tagId),
  }),
);
