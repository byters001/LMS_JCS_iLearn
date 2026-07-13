// Shared Monaco setup (language defaults, theme) consumed by
// features/coding/components/CodeEditor.tsx. Centralized here so every
// screen that ever embeds Monaco (currently just the attempt-taking coding
// question, eventually trainer-side question authoring) shares one config
// instead of redefining it per call site.

// Maps the backend's Judge0-language-key strings (question.coding.
// supportedLanguages, validated against JUDGE0_LANGUAGE_ID's keys — see
// backend/src/integrations/judge0/judge0.constants.ts) to Monaco's own
// language ids, since the two naming schemes don't line up 1:1.
export const JUDGE0_TO_MONACO_LANGUAGE: Record<string, string> = {
  C: 'c',
  CPP: 'cpp',
  JAVA: 'java',
  JAVASCRIPT: 'javascript',
  PYTHON3: 'python',
}

export const MONACO_THEME = 'vs-dark'

export const MONACO_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  tabSize: 2,
} as const
