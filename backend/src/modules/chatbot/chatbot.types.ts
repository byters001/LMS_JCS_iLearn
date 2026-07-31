// The caller context every allowlisted tool's execute() receives — same
// RBAC primitives every other module's service layer already threads
// through (activeCollegeId, requester id), plus isSuperAdmin, needed
// specifically because trainersService.getTrainerPerformance (reused
// verbatim from Phase 5) has no internal college/caller scoping of its
// own — see chatbot.tools.ts's getTrainerPerformance tool for exactly why
// that one re-checks it here.
export interface ChatbotToolContext {
  userId: string;
  activeCollegeId: string | null;
  isSuperAdmin: boolean;
}

// A tool's execute() result, re-shaped into flat CSV rows for the
// "download" feature (item 5) — null/undefined toCsv means "this tool's
// result isn't a flat, tabular shape," a stated limitation, not a
// half-built converter forcing a nested object into bad CSV.
export interface ChatbotCsvExport {
  filename: string;
  header: string[];
  rows: string[][];
}

// --- GET /chatbot/queries (admin audit log) ---
//
// askedByName/askedByEmail are RESOLVED here (repository-level LEFT JOIN),
// not left as a bare userId for the frontend to look up separately — this
// is a super_admin-only audit view, and "who asked this" is the whole
// point of an audit trail, not an incidental detail. Both are null only
// when askedBy itself is null (the user account was since deleted —
// chatbot_query_log.asked_by is ON DELETE SET NULL, chatbot.schema.ts's
// own comment — an audit row outlives the account it references).
export interface ChatbotQueryLogEntry {
  id: string;
  askedBy: string | null;
  askedByName: string | null;
  askedByEmail: string | null;
  questionText: string;
  // null means this question never resolved to an allowlisted function —
  // either NVIDIA itself failed, the model declined to call a tool, or it
  // proposed one that failed validateToolCall (an unallowlisted name or
  // malformed arguments). These are the security-relevant rows this
  // endpoint exists to surface — see chatbot.schema.ts's module comment.
  resolvedFn: string | null;
  resolvedArgs: unknown;
  createdAt: Date;
}

export interface ListChatbotQueriesResult {
  items: ChatbotQueryLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AskChatbotResult {
  // The chatbot_query_log row id this call was recorded under (chatbot.
  // repository.ts's logQuery already returns the full inserted row —
  // this just threads its id through instead of discarding it). The
  // frontend's "Download" feature (item 5) needs this to call GET
  // /chatbot/queries/:id/export against the SAME row that was just
  // logged, rather than having no way to reference it at all.
  queryLogId: string;
  question: string;
  // null when the model didn't resolve to any allowlisted function at all
  // (declined to call a tool, or proposed one that failed validation) —
  // askChatbot throws in that case rather than returning this shape, so in
  // practice a successful AskChatbotResult always has a non-null
  // functionCalled. Kept nullable in the type anyway so a future caller
  // that wants to inspect a "no match" outcome without a try/catch has a
  // real field to check, rather than the type lying about what's possible.
  functionCalled: string | null;
  args: unknown;
  result: unknown;
  answer: string;
}
