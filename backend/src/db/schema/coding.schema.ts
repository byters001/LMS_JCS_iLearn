import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { attemptResponses } from './attempts.schema';

// coding_submissions is modules/coding's own domain table (Judge0
// execution results) — kept in its own schema file rather than folded
// into attempts.schema.ts. CLAUDE.md lists `coding` as its own top-level
// module, separate from `attempts`, with a distinct boundary
// responsibility (the only module allowed to call
// integrations/judge0/submission.service.ts). This table's columns
// (language, source_code, test_cases_passed/total, compile_error,
// runtime_error, execution_output) are all Judge0-execution-specific — a
// different domain from attempts.schema.ts's lifecycle/frozen-selections/
// generic-response tables. Matches "one file per domain" and keeps
// modules/coding's own DB ownership self-contained, the same way
// question-bank owns its own schema file for its own tables.
//
// language is plain TEXT here, matching schema.sql exactly — there is no
// FK to a languages table in the DB. It's validated at the Zod layer
// against JUDGE0_LANGUAGE_ID's keys via question-bank.schema.ts's
// exported codingLanguageSchema (reused directly by
// modules/coding/coding.schema.ts, not redefined).
//
// Append-only, no updated_at (schema.sql gives it none) — and no unique
// constraint on attempt_response_id: a student can resubmit code for the
// same question multiple times within an attempt, and each submission
// gets its own row (a submission history), while attempt_responses'
// is_correct/marks_obtained reflects the BEST result across every
// submission for that question within the attempt — a resubmission that
// scores worse than a prior one does not overwrite it. See
// attempts.service.ts's submitCode for exactly where that comparison
// happens (a cheap re-read right before the final grade write, not a new
// long-running operation) — it reuses the same upsert
// attempts.repository.ts's submitResponse already uses for every other
// response type, just made conditional on the new result being >= the
// existing one.
export const codingSubmissions = pgTable(
  'coding_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptResponseId: uuid('attempt_response_id')
      .notNull()
      .references(() => attemptResponses.id, { onDelete: 'restrict' }),
    language: text('language').notNull(),
    sourceCode: text('source_code').notNull(),
    testCasesPassed: integer('test_cases_passed').notNull().default(0),
    testCasesTotal: integer('test_cases_total').notNull().default(0),
    compileError: text('compile_error'),
    runtimeError: text('runtime_error'),
    executionOutput: jsonb('execution_output'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    responseIdx: index('idx_coding_submissions_response').on(table.attemptResponseId),
  }),
);
