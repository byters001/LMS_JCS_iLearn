import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { chatbotQueryLog } from '../../db/schema/chatbot.schema';
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

// Not currently exposed via a route (no "chatbot history" UI in this
// phase — that's a 6b/frontend concern) — added anyway since a query-log
// table with no way to ever list it back is an odd shape for an audit
// log to have; keeping this here documents that the read path exists at
// the repository layer, ready for a future admin-facing history view.
async function listRecentQueries(limit: number): Promise<ChatbotQueryLog[]> {
  return db.select().from(chatbotQueryLog).orderBy(desc(chatbotQueryLog.createdAt)).limit(limit);
}

export const chatbotRepository = {
  logQuery,
  findQueryById,
  listRecentQueries,
};
