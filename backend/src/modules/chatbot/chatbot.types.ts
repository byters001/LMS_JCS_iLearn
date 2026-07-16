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

export interface AskChatbotResult {
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
