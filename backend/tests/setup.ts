// Loads .env into process.env BEFORE any test file (and therefore
// config/env.ts) imports run — Node 22's native process.loadEnvFile,
// same effect as the tsx --env-file flag every other script in
// package.json already uses, just wired through vitest's setupFiles
// since vitest has no built-in --env-file passthrough of its own.
process.loadEnvFile(new URL('../.env', import.meta.url));

// Dynamic import, not a static one, deliberately: once compiled, a static
// `import` at the top of this file would be hoisted above the
// process.loadEnvFile call above regardless of source order, causing
// db/client.ts (and therefore config/env.ts's DATABASE_URL parse) to run
// before .env was ever loaded. A dynamic import executes exactly where
// it's written. enableAmbientTestTransactions() flips the ambient
// test-transaction routing on for this whole worker process — see
// db/client.ts's own module comment for the full gating story (it also
// independently refuses to run unless NODE_ENV === 'test', which vitest
// sets automatically; this call site is not the only guard).
const { enableAmbientTestTransactions } = await import('../src/db/client');
enableAmbientTestTransactions();
