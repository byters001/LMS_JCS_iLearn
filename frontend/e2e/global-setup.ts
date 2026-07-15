// Runs once before the Playwright suite. Idempotent: safe to run against a
// DB that already has this fixture from a prior run (upserts by fixed ID,
// resets the password every run so tests never depend on remembering
// whether a previous run's password write succeeded). Only ever touches
// rows this suite owns (FIXTURE_STUDENT_USER_ID and its dependents) — never
// an existing seed account. See fixtures.ts for why a new account was
// created rather than reusing one of the real seed students.
import argon2 from 'argon2'
import { createDbClient } from './db'
import {
  FIXTURE_BATCH_ID,
  FIXTURE_COLLEGE_ID,
  FIXTURE_DEPARTMENT_ID,
  FIXTURE_STUDENT_EMAIL,
  FIXTURE_STUDENT_FULL_NAME,
  FIXTURE_STUDENT_PASSWORD,
  FIXTURE_STUDENT_PROFILE_ID,
  FIXTURE_STUDENT_USER_ID,
  FIXTURE_TPS_ID,
  FIXTURE_TRAINING_PROGRAM_ID,
  STUDENT_ROLE_ID,
} from './fixtures'

export default async function globalSetup(): Promise<void> {
  const sql = createDbClient()
  try {
    const passwordHash = await argon2.hash(FIXTURE_STUDENT_PASSWORD)

    await sql`
      insert into users (id, email, password_hash, full_name, is_active)
      values (${FIXTURE_STUDENT_USER_ID}, ${FIXTURE_STUDENT_EMAIL}, ${passwordHash}, ${FIXTURE_STUDENT_FULL_NAME}, true)
      on conflict (id) do update set password_hash = excluded.password_hash, is_active = true, deleted_at = null
    `;

    await sql`
      insert into user_roles (user_id, role_id, college_id)
      values (${FIXTURE_STUDENT_USER_ID}, ${STUDENT_ROLE_ID}, ${FIXTURE_COLLEGE_ID})
      on conflict do nothing
    `;

    await sql`
      insert into student_profiles (id, user_id, college_id, department_id, status)
      values (${FIXTURE_STUDENT_PROFILE_ID}, ${FIXTURE_STUDENT_USER_ID}, ${FIXTURE_COLLEGE_ID}, ${FIXTURE_DEPARTMENT_ID}, 'active')
      on conflict (id) do update set status = 'active'
    `;

    await sql`
      insert into training_program_students (id, training_program_id, student_id, batch_id, status)
      values (${FIXTURE_TPS_ID}, ${FIXTURE_TRAINING_PROGRAM_ID}, ${FIXTURE_STUDENT_PROFILE_ID}, ${FIXTURE_BATCH_ID}, 'active')
      on conflict (id) do update set status = 'active'
    `;

    // eslint-disable-next-line no-console
    console.log(`[e2e global-setup] Fixture student ready: ${FIXTURE_STUDENT_EMAIL}`)
  } finally {
    await sql.end();
  }
}
