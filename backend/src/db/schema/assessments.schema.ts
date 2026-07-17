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
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema';
import { batches } from './organization.schema';
import { questionPools, questionVersions } from './question-bank.schema';
import { trainingSessions } from './trainers.schema';

// Names match schema.sql's CREATE TYPE statements exactly — these types
// already exist in the real Postgres database.
export const testCategoryEnum = pgEnum('test_category_enum', [
  'mcq',
  'coding',
  'psychometric',
  'mixed',
]);
export const assessmentStatusEnum = pgEnum('assessment_status_enum', [
  'draft',
  'review',
  'approved',
  'scheduled',
  'live',
  'completed',
  'archived',
]);
export const selectionModeEnum = pgEnum('selection_mode_enum', ['manual', 'pool']);
export const assessmentApprovalActionEnum = pgEnum('assessment_approval_action_enum', [
  'submitted',
  'approved',
  'rejected',
  'scheduled',
  'published',
]);

export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Nullable (item 4, decision doc) — assessment_batches, not training
    // session, is the mechanism that actually controls student visibility
    // (confirmed directly in item 8A's diagnosis: listAvailableAssessments
    // joins assessment_batches, never training_sessions). Training Session
    // is a looser organizational label; requiring one at creation was
    // friction with no real authorization purpose behind it, and no
    // "Create Training Session" flow exists to unblock a college with none
    // yet. ON DELETE RESTRICT unchanged — a NULL FK value is exempt from the
    // constraint entirely (standard SQL), so this needs no ON DELETE change.
    trainingSessionId: uuid('training_session_id').references(() => trainingSessions.id, {
      onDelete: 'restrict',
    }),
    title: text('title').notNull(),
    description: text('description'),
    testCategory: testCategoryEnum('test_category').notNull(),
    timerMinutes: integer('timer_minutes'),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    maxAttempts: integer('max_attempts').notNull().default(1),
    shuffleQuestions: boolean('shuffle_questions').notNull().default(false),
    randomQuestionCount: integer('random_question_count'),
    negativeMarking: boolean('negative_marking').notNull().default(false),
    negativeMarkingValue: numeric('negative_marking_value', { precision: 6, scale: 2 }).default(
      '0',
    ),
    proctoringCameraRequired: boolean('proctoring_camera_required').notNull().default(false),
    proctoringFullscreenRequired: boolean('proctoring_fullscreen_required')
      .notNull()
      .default(false),
    isPractice: boolean('is_practice').notNull().default(false),
    status: assessmentStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    sessionIdx: index('idx_assessments_session')
      .on(table.trainingSessionId)
      .where(sql`${table.deletedAt} IS NULL`),
    statusIdx: index('idx_assessments_status')
      .on(table.status)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

// No deleted_at — a section's lifecycle is tied entirely to its parent
// assessment's (ON DELETE CASCADE below); schema.sql gives it no
// independent soft-delete column, same pattern as academic_years/
// training_program_students not getting one either.
export const assessmentSections = pgTable(
  'assessment_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    instructions: text('instructions'),
    sectionOrder: integer('section_order').notNull().default(0),
    timerMinutes: integer('timer_minutes'),
    passingMarks: numeric('passing_marks', { precision: 6, scale: 2 }),
    negativeMarking: boolean('negative_marking').notNull().default(false),
    negativeMarkingValue: numeric('negative_marking_value', { precision: 6, scale: 2 }).default(
      '0',
    ),
    shuffleQuestions: boolean('shuffle_questions').notNull().default(false),
    // 'manual' = questions listed explicitly in assessment_questions;
    // 'pool' = questions resolved dynamically from question_pools via
    // assessment_section_pools + question-bank's pool-criteria resolution.
    // See assessments.service.ts's resolveSectionQuestions for exactly how
    // this branches.
    selectionMode: selectionModeEnum('selection_mode').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    assessmentIdx: index('idx_assessment_sections_assessment').on(table.assessmentId),
  }),
);

// The MANUAL half of section question selection — an explicit, ordered list
// of specific question_version_id rows. Mutually exclusive in practice with
// assessment_section_pools for a given section (enforced at the service
// layer via selection_mode, not by the DB — see that file). No lifecycle
// columns: a pure junction row plus the two settings (marks_override,
// sort_order) that only make sense scoped to "this question in this
// section," not to the question itself.
export const assessmentQuestions = pgTable(
  'assessment_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentSectionId: uuid('assessment_section_id')
      .notNull()
      .references(() => assessmentSections.id, { onDelete: 'cascade' }),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
    marksOverride: numeric('marks_override', { precision: 6, scale: 2 }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => ({
    sectionIdx: index('idx_assessment_questions_section').on(table.assessmentSectionId),
    versionIdx: index('idx_assessment_questions_version').on(table.questionVersionId),
    sectionVersionUnique: unique().on(table.assessmentSectionId, table.questionVersionId),
  }),
);

// The POOL half of section question selection — attaches a reusable
// question_pool to a section; the actual questions are never stored here,
// only resolved on demand by re-running that pool's criteria (question-bank
// Part 3's resolveQuestionPool). ON DELETE RESTRICT on question_pool_id
// (unlike assessment_questions' RESTRICT on question_version_id, both
// deliberately non-cascading): a pool in active use by a scheduled/live
// assessment section can't be silently deleted out from under it.
export const assessmentSectionPools = pgTable(
  'assessment_section_pools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentSectionId: uuid('assessment_section_id')
      .notNull()
      .references(() => assessmentSections.id, { onDelete: 'cascade' }),
    questionPoolId: uuid('question_pool_id')
      .notNull()
      .references(() => questionPools.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sectionIdx: index('idx_assessment_section_pools_section').on(table.assessmentSectionId),
    sectionPoolUnique: unique().on(table.assessmentSectionId, table.questionPoolId),
  }),
);

// Which batches (from organization.schema) may attempt this assessment —
// pure join table, no lifecycle columns. Modeled as part of assessment
// create/update rather than a separate top-level CRUD resource — see
// assessments.service.ts's module comment for the reasoning.
export const assessmentBatches = pgTable(
  'assessment_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    assessmentIdx: index('idx_assessment_batches_assessment').on(table.assessmentId),
    batchIdx: index('idx_assessment_batches_batch').on(table.batchId),
    assessmentBatchUnique: unique().on(table.assessmentId, table.batchId),
  }),
);

// Append-only audit log — same shape and same reasoning as question-bank's
// questionApprovalHistory (Part 3): nothing in schema.sql enforces
// assessment_status_enum transitions (no CHECK constraint, no trigger,
// confirmed by reading schema.sql directly), so the state machine lives
// entirely in assessments.service.ts. Unlike question_approval_history,
// there's no question_version_id-equivalent "what was current at the time"
// column here — assessment_approval_action_enum has 5 values (submitted/
// approved/rejected/scheduled/published) vs questions' 3, reflecting a
// longer workflow (draft -> review -> approved -> scheduled -> live), but
// the row shape itself is otherwise identical.
export const assessmentApprovalHistory = pgTable(
  'assessment_approval_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    action: assessmentApprovalActionEnum('action').notNull(),
    performedBy: uuid('performed_by').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    assessmentIdx: index('idx_assessment_approval_history_assessment').on(table.assessmentId),
  }),
);
