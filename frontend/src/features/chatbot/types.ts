// Frontend-side types for the "chatbot" feature (own copy, not shared with
// the backend's *.types.ts). Matches backend/src/modules/chatbot/
// chatbot.types.ts's AskChatbotResult exactly, including queryLogId (added
// alongside this UI so the Download button below has a row id to call
// GET /chatbot/queries/:id/export against).

export type ChatbotFunctionName =
  | 'getAttendanceByDate'
  | 'getFailedStudents'
  | 'getTrainerPerformance'
  | 'getBatchRoster'

export interface AskChatbotInput {
  question: string
}

export interface AskChatbotResult {
  queryLogId: string
  question: string
  functionCalled: ChatbotFunctionName | null
  args: unknown
  result: unknown
  answer: string
}

// Mirrors backend/src/modules/chatbot/chatbot.tools.ts's CHATBOT_TOOLS —
// every tool there currently defines a `toCsv`, so all four are exportable
// today. Kept as an explicit allowlist (not "always show Download") because
// whether a given resolved function supports CSV export is a property of
// that specific tool's own implementation, not something the frontend can
// infer from a single response shape — this list must be kept in sync with
// which tools define `toCsv` on the backend.
export const EXPORTABLE_CHATBOT_FUNCTIONS: ReadonlySet<ChatbotFunctionName> = new Set([
  'getAttendanceByDate',
  'getFailedStudents',
  'getTrainerPerformance',
  'getBatchRoster',
])

// --- Admin audit log (GET /chatbot/queries) ---
// Matches backend/src/modules/chatbot/chatbot.types.ts's ChatbotQueryLogEntry
// exactly. resolvedFn is deliberately the bare backend string, not narrowed
// to ChatbotFunctionName — a REJECTED attempt (the security-relevant case
// this log exists for) can carry a hallucinated/unallowlisted function name
// that was never in CHATBOT_TOOLS to begin with, so it wouldn't fit that
// narrower union.
export interface ChatbotQueryLogEntry {
  id: string
  askedBy: string | null
  askedByName: string | null
  askedByEmail: string | null
  questionText: string
  resolvedFn: string | null
  resolvedArgs: unknown
  createdAt: string
}

export interface ListChatbotQueriesParams {
  page?: number
  pageSize?: number
}

export interface ListChatbotQueriesResult {
  items: ChatbotQueryLogEntry[]
  total: number
  page: number
  pageSize: number
}
