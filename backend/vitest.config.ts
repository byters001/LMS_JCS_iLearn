import { defineConfig } from 'vitest/config';

// Integration tests hit the real Supabase dev DB (see tests/integration's
// own module comments for the full DB-strategy reasoning) — real network
// round-trips per query, so both the per-test and per-hook timeouts are
// raised well above vitest's 5s default. setupFiles loads .env via
// Node's native process.loadEnvFile (Node 22, no dotenv dependency
// needed) before config/env.ts's envSchema.safeParse(process.env) ever
// runs — same effect as tsx's own --env-file flag used by dev/start/db:*
// scripts, just wired through vitest's own hook since vitest doesn't
// expose an --env-file passthrough itself.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Fixture chains in these tests run 20-30+ sequential, awaited real
    // Supabase round trips (college -> department -> program -> batch ->
    // session -> student -> questions -> assessment workflow) before a
    // single assertion runs — 20s (vitest's already-raised-once default)
    // still timed out in practice once background fire-and-forget
    // notification retries (each up to 3 attempts x 5s timeout) were also
    // competing for the network. 60s gives real headroom without masking a
    // genuine hang (a truly stuck test still fails, just later).
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Integration tests share one real DB connection pool and mutate
    // real rows (even if self-contained and cleaned up) — running test
    // FILES in parallel worker processes risks two files' cleanup/setup
    // interleaving in ways that are hard to reason about for no real
    // speed benefit at this test count. Sequential keeps behavior
    // predictable; revisit if the suite grows large enough that this
    // becomes a real bottleneck.
    fileParallelism: false,
  },
});
