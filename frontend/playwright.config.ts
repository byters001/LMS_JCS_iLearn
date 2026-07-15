import { defineConfig, devices } from '@playwright/test'

// Deliberately does NOT use Playwright's `webServer` option to auto-start
// the app: that would only cover the frontend (`vite`), and this suite
// needs the REAL backend too (real cookies, real DB writes) — a second,
// independent process `webServer` can technically also manage, but per
// CLAUDE1.md's "local development only" phase this stays simple instead of
// scripting cross-repo process orchestration. Run `pnpm dev` in both
// backend/ and frontend/ first, same requirement stated in the "test:e2e"
// script's own comment in package.json.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Confirmed live: 2 parallel Chromium workers (Playwright's default when
  // it detects >1 CPU) OOM-crashed on this machine alongside the two
  // already-running dev servers (backend + frontend). This is a two-spec
  // suite — serial execution costs a few seconds, not worth chasing a
  // parallel-safe config for.
  workers: 1,
  retries: 0,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // Real Supabase round trips (startAttempt alone is
  // findAssessmentById + assertBatchAuthorized + resolveSectionQuestions +
  // a createAttemptWithSelections transaction, then AttemptPage's own
  // useAttempt + useAttemptQuestions after the redirect) run noticeably
  // slower than the 5s default against a real remote dev DB — confirmed
  // live: the first run of attempt-flow.spec.ts timed out mid-load with
  // the real attempt already created server-side (teardown still found
  // and cleaned it up), not because anything was actually broken.
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
