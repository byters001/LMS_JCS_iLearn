// Wraps @monaco-editor/react. Lazy-loaded (React.lazy/dynamic import) so
// Monaco never ships in the main bundle — not every assessment includes
// a coding section. Applies the shared setup from lib/monaco.config.ts.
export {}
