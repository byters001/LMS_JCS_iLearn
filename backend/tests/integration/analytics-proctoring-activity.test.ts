import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { proctoringEvents } from '../../src/db/schema/attempts.schema';
import { analyticsService } from '../../src/modules/analytics/analytics.service';
import { assessmentsService } from '../../src/modules/assessments/assessments.service';
import { attemptsService } from '../../src/modules/attempts/attempts.service';
import { usersService } from '../../src/modules/users/users.service';
import { ForbiddenError } from '../../src/shared/errors/app-error';
import {
  createRegistry,
  setupWithCleanup,
  cleanupRegistry,
  makeUser,
  makeCollege,
  makeDepartment,
  makeTrainingProgram,
  makeBatch,
  makeTrainingSession,
  makeStudent,
  enrollStudentInBatch,
  makeApprovedQuestion,
  createDraftAssessment,
  publishDraftAssessment,
  trackAttempt,
  type FixtureRegistry,
} from './helpers';

// getProctoringActivity — the Phase 2 dashboard correction replacing the
// originally-proposed "proctoring flags, pending/reviewed" admin stat.
// proctoring_events has no review-status column anywhere (append-only, no
// update path exists — confirmed against schema.sql earlier this
// engagement), so this reports a raw, honestly-labeled count instead. Same
// requireSuperAdmin-on-top-of-analytics.view authorization shape as
// getPlatformOverview/getCollegePerformance (analytics-platform-overview.
// test.ts's own precedent) — that boundary plus real counting correctness
// against a genuine proctoring_events row (via attemptsService.
// recordProctoringEvent, not a fabricated fixture) are this file's two
// targets.
describe('Proctoring activity — access control and counting', () => {
  const registry: FixtureRegistry = createRegistry();
  let actorId: string;
  let collegeId: string;
  let superAdminUserId: string;
  let facultyUserId: string;
  let studentUserId: string;
  let attemptId: string;

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const actor = await makeUser(registry, 'pract-actor');
      actorId = actor.id;

      const college = await makeCollege(registry, actorId);
      collegeId = college.id;
      const department = await makeDepartment(registry, college.id, actorId);
      const program = await makeTrainingProgram(registry, college.id, department.id, actorId);
      const batch = await makeBatch(registry, program.id, actorId);
      const session = await makeTrainingSession(registry, program.id, actorId);

      const { user: studentUser, profile } = await makeStudent(registry, college.id, actorId);
      studentUserId = studentUser.id;
      await enrollStudentInBatch(registry, program.id, profile.id, batch.id, actorId);

      const mcq = await makeApprovedQuestion(
        registry,
        {
          type: 'mcq',
          difficulty: 'easy',
          questionText: 'What is 2 + 2?',
          marks: 1,
          options: [
            { optionText: '3', isCorrect: false, sortOrder: 0 },
            { optionText: '4', isCorrect: true, sortOrder: 1 },
          ],
        },
        actorId,
      );

      const assessment = await createDraftAssessment(
        registry,
        {
          trainingSessionId: session.id,
          title: 'Proctoring activity fixture assessment',
          testCategory: 'mcq',
          batchIds: [batch.id],
        },
        actorId,
      );
      const section = await assessmentsService.createAssessmentSection(
        assessment.id,
        { title: 'Section 1' },
        actorId,
      );
      await assessmentsService.createAssessmentQuestion(assessment.id, section.id, {
        questionVersionId: mcq.currentVersion!.id,
      });
      await publishDraftAssessment(assessment.id, actorId);

      // A real 'in_progress' attempt, then a real proctoring_events row —
      // tab_switch needs no assessment-level proctoring flag (see
      // attempts.service.ts's assertProctoringEventAllowed), so this is the
      // simplest genuine row to create without also configuring camera/
      // fullscreen requirements on the fixture assessment.
      const attempt = await attemptsService.startAttempt(studentUserId, assessment.id, {});
      attemptId = attempt.id;
      trackAttempt(registry, attemptId);
      await attemptsService.recordProctoringEvent(studentUserId, attemptId, {
        eventType: 'tab_switch',
      });

      const superAdminRole = await usersService.findRoleBySlug('super_admin');
      const superAdminUser = await makeUser(registry, 'pract-super-admin');
      superAdminUserId = superAdminUser.id;
      await usersService.assignRole(superAdminUserId, { roleId: superAdminRole.id }, actorId);

      // Faculty holds analytics.view too — the real thing under test is
      // that holding it alone isn't enough for this cross-college endpoint,
      // same as the platform-overview trio.
      const facultyRole = await usersService.findRoleBySlug('faculty');
      const facultyUser = await makeUser(registry, 'pract-faculty');
      facultyUserId = facultyUser.id;
      await usersService.assignRole(
        facultyUserId,
        { roleId: facultyRole.id, collegeId: college.id },
        actorId,
      );
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  it('rejects a Faculty caller despite holding analytics.view', async () => {
    await expect(
      analyticsService.getProctoringActivity(collegeId, 7, facultyUserId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('counts the real tab_switch event for a Super Admin caller, scoped to the fixture college', async () => {
    const result = await analyticsService.getProctoringActivity(collegeId, 7, superAdminUserId);

    expect(result.collegeId).toBe(collegeId);
    expect(result.windowDays).toBe(7);
    expect(result.totalEvents).toBe(1);
    expect(result.distinctFlaggedAttempts).toBe(1);
    expect(result.byType).toEqual([{ eventType: 'tab_switch', count: 1 }]);
    expect(result.recentEvents).toHaveLength(1);
    expect(result.recentEvents[0]).toMatchObject({
      eventType: 'tab_switch',
      attemptId,
      studentId: expect.any(String),
      assessmentTitle: 'Proctoring activity fixture assessment',
      collegeId,
    });
  });

  it('excludes the event when scoped to an unrelated college', async () => {
    const otherCollege = await makeCollege(registry, actorId);
    const result = await analyticsService.getProctoringActivity(
      otherCollege.id,
      7,
      superAdminUserId,
    );
    expect(result.totalEvents).toBe(0);
    expect(result.distinctFlaggedAttempts).toBe(0);
    expect(result.byType).toEqual([]);
    expect(result.recentEvents).toEqual([]);
  });

  it('excludes an event once it falls outside the requested day window', async () => {
    // Backdates the fixture row directly (no service-layer way to create a
    // proctoring event with a past occurredAt — recordProctoringEvent
    // always inserts with defaultNow()) to actually exercise the `since`
    // boundary, not just trust it.
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await db
      .update(proctoringEvents)
      .set({ occurredAt: eightDaysAgo })
      .where(eq(proctoringEvents.attemptId, attemptId));

    try {
      const withinSevenDays = await analyticsService.getProctoringActivity(
        collegeId,
        7,
        superAdminUserId,
      );
      expect(withinSevenDays.totalEvents).toBe(0);

      const withinThirtyDays = await analyticsService.getProctoringActivity(
        collegeId,
        30,
        superAdminUserId,
      );
      expect(withinThirtyDays.totalEvents).toBe(1);
    } finally {
      // Restore for test isolation, even though this describe block has no
      // later test depending on the original timestamp — matches this
      // suite's own "don't leave fixture state mutated" discipline.
      await db
        .update(proctoringEvents)
        .set({ occurredAt: new Date() })
        .where(eq(proctoringEvents.attemptId, attemptId));
    }
  });
});
