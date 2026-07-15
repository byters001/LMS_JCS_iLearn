// Runs once after the Playwright suite (regardless of pass/fail — Playwright
// always invokes globalTeardown). Deliberately narrow: only deletes
// assessment_attempts rows (+ their RESTRICT-FK children) this suite's own
// fixture student created against the target assessment. Does NOT delete
// the fixture user/enrollment itself — those persist across runs (global-
// setup.ts is idempotent and upserts them), same persistent-fixture
// pattern "UI E2E Test Assessment" and its batch already established in
// this DB before this phase. Only cleaning up attempts matters for
// repeatability: TARGET assessment has max_attempts=2, so leaving prior
// runs' attempt rows behind would exhaust it after a couple of reruns.
import { createDbClient } from './db'
import { FIXTURE_STUDENT_PROFILE_ID, TARGET_ASSESSMENT_ID } from './fixtures'

export default async function globalTeardown(): Promise<void> {
  const sql = createDbClient()
  try {
    const attempts = await sql`
      select id from assessment_attempts
      where assessment_id = ${TARGET_ASSESSMENT_ID} and student_id = ${FIXTURE_STUDENT_PROFILE_ID}
    `;
    const attemptIds = attempts.map((row) => row.id as string);

    if (attemptIds.length > 0) {
      await sql`delete from attempt_responses where attempt_id in ${sql(attemptIds)}`;
      await sql`delete from attempt_question_selections where attempt_id in ${sql(attemptIds)}`;
      await sql`delete from assessment_attempts where id in ${sql(attemptIds)}`;
    }

    // eslint-disable-next-line no-console
    console.log(`[e2e global-teardown] Cleaned up ${attemptIds.length} fixture attempt(s).`)
  } finally {
    await sql.end();
  }
}
