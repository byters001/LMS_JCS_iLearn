import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { env } from '../../src/config/env';
import { db } from '../../src/db/client';
import { trainingProgramStudents } from '../../src/db/schema/students.schema';
import { authService } from '../../src/modules/auth/auth.service';
import { organizationService } from '../../src/modules/organization/organization.service';
import { studentsService } from '../../src/modules/students/students.service';
import { permissionCache } from '../../src/rbac/permission-cache';
import { UnauthorizedError } from '../../src/shared/errors/app-error';
import {
  createRegistry,
  setupWithCleanup,
  cleanupRegistry,
  makeUser,
  makeCollege,
  makeDepartment,
  makeTrainingProgram,
  makeBatch,
  type FixtureRegistry,
} from './helpers';

// This suite calls SERVICE functions directly, same convention as every
// other file in this directory (attempts.test.ts, coding.test.ts) — there
// is no app.inject()/real-HTTP-request precedent anywhere in this test
// suite (confirmed by reading attempts.test.ts). authService.login/refresh
// are the EXACT functions auth.controller.ts's real /auth/login and
// /auth/refresh routes call with no extra logic of their own (confirmed by
// reading that controller) — calling them directly here exercises the real
// authentication path, not a shortcut around it.
describe('batch deactivation cascade', () => {
  const registry: FixtureRegistry = createRegistry();
  let actorId: string;
  let collegeId: string;
  let batchId: string;
  let studentUserId: string;
  let studentEmail: string;
  // Captured from the very first (pre-deactivation) login, reused by the
  // final test below — deliberately NOT re-logging-in at that point, since
  // by then the account is already deactivated and a fresh login would
  // correctly fail.
  let accessTokenBeforeDeactivation: string;

  // Matches makeBatch's own hard-coded commonPassword exactly — the
  // student created below gets their password_hash COPIED from the
  // batch's common_password_hash (studentsService.createStudentsInBatch's
  // real production behavior, not a test-only shortcut), so this is the
  // real plaintext password that hash was derived from.
  const studentPassword = 'Test-Password-1234!';

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const actor = await makeUser(registry, 'deactivation-actor');
      actorId = actor.id;
      const college = await makeCollege(registry, actorId);
      collegeId = college.id;
      const department = await makeDepartment(registry, college.id, actorId);
      const program = await makeTrainingProgram(registry, college.id, department.id, actorId);
      const batch = await makeBatch(registry, program.id, actorId);
      batchId = batch.id;

      // activeCollegeId: null => Super Admin, matching this exact caller
      // shape in createStudentsInBatch's own access check.
      const result = await studentsService.createStudentsInBatch(
        batchId,
        {
          students: [
            {
              fullName: 'Test Deactivation Student',
              email: `test-deactivation-${randomUUID()}@jcs-ilearn.test`,
            },
          ],
        },
        null,
        actorId,
      );
      const created = result.created[0]!;
      studentUserId = created.userId;
      studentEmail = created.email;
      registry.userIds.add(created.userId);
      registry.studentProfileIds.add(created.studentProfileId);

      // createStudentsInBatch's own result doesn't include the
      // training_program_students row it creates (only
      // studentProfileId/userId/email/fullName) — look it up directly so
      // cleanupRegistry can delete it before the batch itself (FK order:
      // training_program_students.batch_id has no ON DELETE CASCADE,
      // confirmed live — deleting the batch first throws
      // "still referenced from table training_program_students").
      const [enrollment] = await db
        .select({ id: trainingProgramStudents.id })
        .from(trainingProgramStudents)
        .where(
          and(
            eq(trainingProgramStudents.studentId, created.studentProfileId),
            eq(trainingProgramStudents.batchId, batchId),
          ),
        )
        .limit(1);
      if (enrollment) {
        registry.trainingProgramStudentIds.add(enrollment.id);
      }
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  it('the freshly-provisioned student can log in before the batch is deactivated', async () => {
    const result = await authService.login({ email: studentEmail, password: studentPassword });
    expect(result.user.email).toBe(studentEmail);
    accessTokenBeforeDeactivation = result.accessToken;

    // login() unconditionally calls resolvePermissionsForUser (see
    // auth.service.ts) — so a cache entry exists now, proving the "was it
    // actually cleared" check below is meaningful and not just checking an
    // already-empty key.
    const cached = await permissionCache.get(studentUserId, collegeId);
    expect(cached).not.toBeNull();
  });

  it(
    'deactivating the batch runs the full cascade and genuinely blocks the student from ' +
      'authenticating again — not just changed DB rows',
    async () => {
      // A real login BEFORE deactivation, capturing a real refresh token —
      // this is what "renewing an existing session" actually looks like.
      const sessionBeforeDeactivation = await authService.login({
        email: studentEmail,
        password: studentPassword,
      });

      const batch = await organizationService.toggleBatchActive(batchId, actorId);
      expect(batch.status).toBe('archived');

      // (c) users.is_active is now false for this student — the actual,
      // only session-kill lever this codebase has (see
      // organization.repository.ts's deactivateBatchCascade for the full
      // finding: there is no per-user refresh-token index to bulk-revoke
      // from, and access tokens are stateless with no per-request DB/Redis
      // check at all — is_active, checked by login()/refresh() below, is
      // what's real here).

      // A fresh login attempt now fails.
      await expect(
        authService.login({ email: studentEmail, password: studentPassword }),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      // Renewing the PRE-deactivation session also fails now — this is the
      // "genuinely cannot make an authenticated request afterward" proof:
      // the student's own real refresh token, issued moments before
      // deactivation, is rejected by the same code path
      // POST /auth/refresh actually runs.
      await expect(
        authService.refresh(sessionBeforeDeactivation.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      // (e) permission cache invalidated — confirmed cleared, not just
      // assumed from the code path having run.
      const cachedAfter = await permissionCache.get(studentUserId, collegeId);
      expect(cachedAfter).toBeNull();
    },
  );

  // Stated, not silently glossed over: this is the one residual gap the
  // finding above describes. An access token issued BEFORE deactivation
  // stays cryptographically valid (signature + expiry only, no per-request
  // is_active check in authenticate.plugin.ts) until it naturally expires
  // (JWT_ACCESS_EXPIRY, 15m in this env) — the cascade in the previous test
  // cannot reach back and invalidate a token that was already handed out.
  // Reusing that EXACT pre-deactivation token here (not logging in again,
  // which would now correctly fail) is what actually demonstrates this:
  // jwt.verify still accepts it, proving the account's deactivation had no
  // effect on a token issued while it was still active. If a future change
  // adds a per-request is_active check to authenticate.plugin.ts, this
  // specific assertion is what would need to change — it's the executable
  // record of today's real behavior, not a guard demanding it stay this way
  // forever.
  it('an access token issued before deactivation remains independently valid (the stated residual limit)', () => {
    const decoded = jwt.verify(accessTokenBeforeDeactivation, env.JWT_SECRET) as { sub: string };
    expect(decoded.sub).toBe(studentUserId);
  });
});
