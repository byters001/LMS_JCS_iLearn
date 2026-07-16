import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.schema';

// Phase 6a — audit log for every chatbot function-call resolution
// attempt, successful OR rejected. A rejected attempt (an unallowlisted
// function name, or malformed arguments) is written here too — see
// modules/chatbot/chatbot.service.ts's askChatbot, which logs BEFORE
// validateToolCall can throw — a rejected function-call attempt is itself
// security-relevant audit data, not noise to discard.
export const chatbotQueryLog = pgTable(
  'chatbot_query_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // SET NULL, not CASCADE/RESTRICT: an audit row should outlive the
    // user account it references, same as every other created_by/
    // performed_by column elsewhere in this schema (e.g. colleges.
    // created_by, assessment_approval_history.performed_by) — losing
    // track of WHO asked shouldn't delete the record that a question was
    // asked at all.
    askedBy: uuid('asked_by').references(() => users.id, { onDelete: 'set null' }),
    questionText: text('question_text').notNull(),
    // Nullable: the NVIDIA call itself can fail before any function is
    // even proposed (nothing to resolve), or the model can answer with
    // plain text instead of calling a tool at all.
    resolvedFn: text('resolved_fn'),
    // The RAW arguments object as attempted — recorded even when it's
    // about to be rejected by validateToolCall (wrong shape, extra
    // fields, etc.), since that's exactly the audit trail a rejected
    // attempt needs. Not schema-validated at the column level (can't be —
    // its shape depends on which function name was attempted, including
    // invalid ones with no schema at all).
    resolvedArgs: jsonb('resolved_args'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    askedByIdx: index('idx_chatbot_query_log_asked_by').on(table.askedBy),
    createdAtIdx: index('idx_chatbot_query_log_created_at').on(table.createdAt),
  }),
);
