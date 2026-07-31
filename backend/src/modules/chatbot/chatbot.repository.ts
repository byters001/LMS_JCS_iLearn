import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { chatbotQueryLog } from '../../db/schema/chatbot.schema';
import { users } from '../../db/schema/identity.schema';
import type { ChatbotQueryLog } from '../../db/types';

export interface LogQueryData {
  askedBy: string | null;
  questionText: string;
  resolvedFn: string | null;
  resolvedArgs: unknown;
}

// Called for EVERY question, successful or rejected — see chatbot.
// service.ts's askChatbot, which calls this before validateToolCall can
// throw, so a rejected attempt is recorded with whatever (possibly
// invalid) resolvedFn/resolvedArgs the model actually proposed.
async function logQuery(data: LogQueryData): Promise<ChatbotQueryLog> {
  const [row] = await db
    .insert(chatbotQueryLog)
    .values({
      askedBy: data.askedBy,
      questionText: data.questionText,
      resolvedFn: data.resolvedFn,
      resolvedArgs: data.resolvedArgs,
    })
    .returning();
  return row;
}

// Used by the "download" route (chatbot.service.ts's
// exportResolvedQueryAsCsv, item 5) to re-fetch what was resolved for a
// given past question, so it can re-run the SAME allowlisted function
// live rather than trusting a cached result blob.
async function findQueryById(id: string): Promise<ChatbotQueryLog | undefined> {
  const [row] = await db.select().from(chatbotQueryLog).where(eq(chatbotQueryLog.id, id)).limit(1);
  return row;
}

// The admin-facing history view this table was always meant to back (see
// this file's since-superseded listRecentQueries, which this replaces —
// that one took a bare limit with no offset/total, not real pagination).
// LEFT JOINs users (not INNER) because askedBy is SET NULL on user
// deletion (chatbot.schema.ts's own comment) — a row whose asker was since
// deleted must still appear in the audit log, just with a null name/email,
// never silently dropped from an audit trail.
export interface ChatbotQueryLogRow {
  id: string;
  askedBy: string | null;
  askedByName: string | null;
  askedByEmail: string | null;
  questionText: string;
  resolvedFn: string | null;
  resolvedArgs: unknown;
  createdAt: Date;
}

export interface ListQueriesParams {
  page: number;
  pageSize: number;
}

export interface ListQueriesResult {
  items: ChatbotQueryLogRow[];
  total: number;
}

async function listQueries(params: ListQueriesParams): Promise<ListQueriesResult> {
  const { page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: chatbotQueryLog.id,
        askedBy: chatbotQueryLog.askedBy,
        askedByName: users.fullName,
        askedByEmail: users.email,
        questionText: chatbotQueryLog.questionText,
        resolvedFn: chatbotQueryLog.resolvedFn,
        resolvedArgs: chatbotQueryLog.resolvedArgs,
        createdAt: chatbotQueryLog.createdAt,
      })
      .from(chatbotQueryLog)
      .leftJoin(users, eq(users.id, chatbotQueryLog.askedBy))
      .orderBy(desc(chatbotQueryLog.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(chatbotQueryLog),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

export const chatbotRepository = {
  logQuery,
  findQueryById,
  listQueries,
};
