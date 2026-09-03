// Temporary, easily-reversible feature flags — plain constants, not env
// vars: these are meant to be flipped back with a one-line code change
// (grep this file), not configured per-environment, so they don't belong
// in lib/env.ts's validated import.meta.env surface (CLAUDE1.md non-
// negotiable #6 governs required runtime config, not a temporary kill
// switch like this one).

// UI cleanup phase, item 5 — hides ChatbotWidget (see that component's own
// early-return) in every layout that renders it, without touching
// AdminLayout.tsx/TrainerLayout.tsx themselves. Backend has its own,
// independent flag (config/env.ts's CHATBOT_ENABLED) that rejects
// POST /chatbot/ask directly — flip both back to re-enable.
export const CHATBOT_ENABLED = false
