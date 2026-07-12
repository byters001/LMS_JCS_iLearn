// Loads .env into process.env BEFORE any test file (and therefore
// config/env.ts) imports run — Node 22's native process.loadEnvFile,
// same effect as the tsx --env-file flag every other script in
// package.json already uses, just wired through vitest's setupFiles
// since vitest has no built-in --env-file passthrough of its own.
process.loadEnvFile(new URL('../.env', import.meta.url));
