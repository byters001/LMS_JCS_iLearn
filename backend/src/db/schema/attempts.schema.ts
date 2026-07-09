import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { assessmentSections, assessments } from './assessments.schema';
import { questionOptions, questionVersions } from './question-bank.schema';
import { studentProfiles } from './students.schema';

// Name matches schema.sql's CREATE TYPE statement exactly — this type
// already exists in the real Postgres database.
export const attemptStatusEnum = pgEnum('attempt_status_enum', [
  'not_started',
  'in_progress',
  'submitted',
  'pending_evaluation',
  'invalidated',
]);

// student_id references student_profiles(id), NOT users(id) directly — a
// user must have a student_profiles row (student_profiles.user_id is
// UNIQUE) before they can hold an attempt; see attempts.service.ts's
// startAttempt for how the caller's JWT user id is resolved to a
// student_profiles.id before this row is ever written.
//
// UNIQUE(assessment_id, student_id, attempt_number) is what makes
// attempt_number a real, DB-enforced sequence per (assessment, student)
// pair, not just an advisory counter — see attempts.repository.ts's
// countAttemptsForStudent/createAttemptWithSelections for how the next
// number is computed and raced against this constraint.
export const assessmentAttempts = pgTable(
  'assessment_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'restrict' }),
    attemptNumber: integer('attempt_number').notNull().default(1),
    status: attemptStatusEnum('status').notNull().default('not_started'),
    startTime: timestamp('start_time', { withTimezone: true }),
    endTime: timestamp('end_time', { withTimezone: true }),
    submissionTime: timestamp('submission_time', { withTimezone: true }),
    ipAddress: text('ip_address'),
    browserInfo: text('browser_info'),
    totalScore: numeric('total_score', { precision: 8, scale: 2 }),
    rankInBatch: integer('rank_in_batch'),
    isRetake: boolean('is_retake').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    assessmentIdx: index('idx_attempts_assessment').on(table.assessmentId),
    studentIdx: index('idx_attempts_student').on(table.studentId),
    statusIdx: index('idx_attempts_status').on(table.status),
    assessmentStudentAttemptUnique: unique().on(
      table.assessmentId,
      table.studentId,
      table.attemptNumber,
    ),
  }),
);

// The frozen result of resolveSectionQuestions run exactly once, at
// startAttempt, for every section of the assessment — manual sections'
// direct join and pool sections' random draw are both flattened into this
// same shape. UNIQUE(attempt_id, question_version_id) is the DB-level
// guarantee that a given attempt can't end up with the same question
// twice (e.g. the same question reachable through two different pools
// attached to the same section). ON DELETE RESTRICT on question_version_id
// (not cascade): a question version already frozen into a live attempt
// can't be silently deleted out from under it — same non-cascading
// treatment assessment_questions.question_version_id already gets.
//
// This table is read from directly by attempts.service.ts's
// getAttemptQuestions and NEVER re-derived via assessmentsService.
// resolveSectionQuestions once an attempt exists — that re-resolution path
// is only ever used once, inside startAttempt, before these rows are
// written.
export const attemptQuestionSelections = pgTable(
  'attempt_question_selections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => assessmentAttempts.id, { onDelete: 'restrict' }),
    assessmentSectionId: uuid('assessment_section_id')
      .notNull()
      .references(() => assessmentSections.id, { onDelete: 'restrict' }),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    attemptIdx: index('idx_aqs_attempt').on(table.attemptId),
    sectionIdx: index('idx_aqs_section').on(table.assessmentSectionId),
    attemptQuestionVersionUnique: unique().on(table.attemptId, table.questionVersionId),
  }),
);

// One row per (attempt, question) the student has answered/touched —
// UNIQUE(attempt_id, question_version_id) is what makes submitResponse an
// upsert (ON CONFLICT DO UPDATE) rather than a plain INSERT; see
// attempts.repository.ts's upsertResponse. selected_option_id is the MCQ
// answer; likert_value is the psychometric answer; a coding answer has no
// column here at all in this phase — coding_submissions (out of scope,
// future coding module) is where that content will live, referencing this
// table's id via attempt_response_id.
//
// is_correct/marks_obtained are populated at submit-response time for MCQ
// only (checked against question_options.is_correct — see
// attempts.service.ts's submitResponse). Both stay NULL for psychometric
// (no notion of "correct") and for coding (grading deferred to the future
// coding module's Judge0 integration).
export const attemptResponses = pgTable(
  'attempt_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => assessmentAttempts.id, { onDelete: 'restrict' }),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
    selectedOptionId: uuid('selected_option_id').references(() => questionOptions.id, {
      onDelete: 'set null',
    }),
    likertValue: smallint('likert_value'),
    isMarkedForReview: boolean('is_marked_for_review').notNull().default(false),
    isCorrect: boolean('is_correct'),
    marksObtained: numeric('marks_obtained', { precision: 6, scale: 2 }),
    timeSpentSeconds: integer('time_spent_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    attemptIdx: index('idx_attempt_responses_attempt').on(table.attemptId),
    questionVersionIdx: index('idx_attempt_responses_question_version').on(
      table.questionVersionId,
    ),
    attemptQuestionVersionUnique: unique().on(table.attemptId, table.questionVersionId),
  }),
);
