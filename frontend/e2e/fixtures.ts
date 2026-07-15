// Fixed identifiers shared by global-setup.ts, global-teardown.ts, and both
// specs. Two kinds of IDs live here:
//   - Pre-existing seed data (batch/training program/assessment/question/
//     option) — looked up directly against the real dev DB, not guessed.
//     "UI E2E Test Assessment" in particular already existed in the seed
//     data under this exact name before this phase, on a batch
//     (CSE-SKCET-Batch-2) with 24 already-active students — evidence an
//     earlier session built it for exactly this purpose. Reused as-is
//     rather than duplicated.
//   - This phase's own fixture student (FIXTURE_STUDENT_*) — a single
//     brand-new, clearly-named, additive-only account global-setup.ts
//     creates if missing. Deliberately NOT reusing one of the real-looking
//     seed students (student031@skcet.ac.in etc.): their passwords are
//     unknown, and there is no user-creation/password-set HTTP endpoint in
//     this backend phase, so the only way to log in as one through the
//     real UI would be to overwrite an existing account's password_hash —
//     riskier than adding one new row nobody else depends on.

export const FIXTURE_STUDENT_EMAIL = 'e2e-fixture-student@skcet.ac.in'
export const FIXTURE_STUDENT_PASSWORD = 'E2eFixture!Passw0rd1'
export const FIXTURE_STUDENT_FULL_NAME = 'E2E Fixture Student'

// Fixed (not randomly generated) so setup/teardown/specs can all reference
// the same row across runs without passing data between processes.
export const FIXTURE_STUDENT_USER_ID = '00000000-0000-4000-a000-e2e000000001'
export const FIXTURE_STUDENT_PROFILE_ID = '00000000-0000-4000-a000-e2e000000002'
export const FIXTURE_TPS_ID = '00000000-0000-4000-a000-e2e000000003'

// "CSE-SKCET-Batch-2" — already active, already authorized for several live
// assessments including the one below.
export const FIXTURE_BATCH_ID = 'e0c714b3-38cc-48d1-b0b7-b4ec37f422dd'
export const FIXTURE_TRAINING_PROGRAM_ID = 'b4fc6ba8-22e5-4212-a525-b124f9acc5c2'
// College/department of an existing student already on that batch
// (student031@skcet.ac.in) — reused so the fixture profile matches real
// enrollment shape rather than guessing plausible-looking FKs.
export const FIXTURE_COLLEGE_ID = 'ca0e2655-cafb-447e-ad58-39aafb026866'
export const FIXTURE_DEPARTMENT_ID = 'b6af4261-f40e-413e-a691-9481ddf50456'

export const STUDENT_ROLE_ID = '9589e710-0575-4de1-9e8e-399ad98b5a5c'

export const TARGET_ASSESSMENT_ID = '66bc982b-aafb-4e38-95f5-6bf1de4ec802'
export const TARGET_ASSESSMENT_TITLE = 'UI E2E Test Assessment'
export const TARGET_QUESTION_TEXT =
  "A train 120m long crosses a pole in 6 seconds. What is its speed in km/hr? (Variant 7)"
export const TARGET_OPTION_TEXT = '72 km/hr'
export const TARGET_OPTION_ID = '07041501-0356-4b7d-a80d-dbfd2a1425ca'
