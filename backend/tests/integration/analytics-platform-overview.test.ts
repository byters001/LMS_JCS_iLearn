import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { analyticsService } from '../../src/modules/analytics/analytics.service';
import { assessmentsService } from '../../src/modules/assessments/assessments.service';
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
  makeStudent,
  enrollStudentInBatch,
  makeApprovedQuestion,
  makeQuestionCategory,
  createDraftAssessment,
  publishDraftAssessment,
  type FixtureRegistry,
} from './helpers';

// Super Admin platform analytics (getPlatformOverview/getCollegePerformance/
// getCategoryImprovement) — the three genuinely new cross-college aggregates
// added alongside the Super Admin Analytics page. Every other function in
// analytics.service.ts is reachable by Faculty too, batch-scoped
// (assertCanAccessBatch); these three are platform/cross-college scoped, so
// they're gated by an extra requireSuperAdmin check on top of the existing
// analytics.view permission (see analytics.service.ts's own comment) — that
// boundary is this file's main target, mirroring
// analytics-trainer-scope.test.ts's own "isolate the authorization boundary
// from needing real attempt fixtures" approach: real students/college/live
// assessment are seeded (so totalStudents/activeAssessments have something
// real to count), but no submitted attempt is created, since none of this
// module's existing helpers build one — score/completion-rate/category
// correctness against REAL scored attempts is a natural follow-up once a
// submitted-attempt fixture helper exists, not something to fake here.
describe('Super Admin platform analytics — access control and scoping', () => {
  const registry: FixtureRegistry = createRegistry();
  let actorId: string;
  let collegeId: string;
  let superAdminUserId: string;
  let facultyUserId: string;

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const actor = await makeUser(registry, 'pa-actor');
      actorId = actor.id;

      const college = await makeCollege(registry, actorId);
      collegeId = college.id;
      const department = await makeDepartment(registry, college.id, actorId);
      const program = await makeTrainingProgram(registry, college.id, department.id, actorId);
      const batch = await makeBatch(registry, program.id, actorId);

      const student = await makeStudent(registry, college.id, actorId);
      await enrollStudentInBatch(registry, program.id, student.profile.id, batch.id, actorId);

      const category = await makeQuestionCategory(registry, 'mcq');
      const mcq = await makeApprovedQuestion(
        registry,
        {
          categoryId: category.id,
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
          title: 'Platform analytics fixture assessment',
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

      const superAdminRole = await usersService.findRoleBySlug('super_admin');
      const superAdminUser = await makeUser(registry, 'pa-super-admin');
      superAdminUserId = superAdminUser.id;
      await usersService.assignRole(superAdminUserId, { roleId: superAdminRole.id }, actorId);

      // Faculty already holds 'analytics.view' (same permission these new
      // endpoints are gated by) — the real thing being tested here is that
      // holding that permission is NOT enough for these three, unlike every
      // other function in this module.
      const facultyRole = await usersService.findRoleBySlug('faculty');
      const facultyUser = await makeUser(registry, 'pa-faculty');
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

  describe('access control — Super Admin only, despite Faculty also holding analytics.view', () => {
    it('allows a Super Admin caller through all three endpoints', async () => {
      await expect(
        analyticsService.getPlatformOverview(undefined, superAdminUserId),
      ).resolves.toBeDefined();
      await expect(analyticsService.getCollegePerformance(superAdminUserId)).resolves.toBeDefined();
      await expect(
        analyticsService.getCategoryImprovement(undefined, superAdminUserId),
      ).resolves.toBeDefined();
    });

    it('rejects a Faculty caller from all three, even scoped to their own college', async () => {
      await expect(
        analyticsService.getPlatformOverview(undefined, facultyUserId),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        analyticsService.getPlatformOverview(collegeId, facultyUserId),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(analyticsService.getCollegePerformance(facultyUserId)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        analyticsService.getCategoryImprovement(collegeId, facultyUserId),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('getPlatformOverview scoping', () => {
    it('counts the real enrolled student and live assessment for the scoped college, with null/zero score metrics given zero submitted attempts', async () => {
      const result = await analyticsService.getPlatformOverview(collegeId, superAdminUserId);
      expect(result.totalStudents).toBe(1);
      expect(result.activeAssessments).toBe(1);
      expect(result.averageScorePercent).toBeNull();
      // totalStudents > 0 but zero distinct students have a submitted
      // attempt yet — 0/1, not null (null is reserved for totalStudents===0).
      expect(result.completionRate).toBe(0);
    });

    it('returns zero counts and a null completion rate for a college with no students at all', async () => {
      const emptyCollege = await makeCollege(registry, actorId);
      const result = await analyticsService.getPlatformOverview(emptyCollege.id, superAdminUserId);
      expect(result.totalStudents).toBe(0);
      expect(result.activeAssessments).toBe(0);
      expect(result.averageScorePercent).toBeNull();
      expect(result.completionRate).toBeNull();
    });
  });

  describe('getCollegePerformance', () => {
    it('includes the fixture college with zero attempts, not silently omitted', async () => {
      const rows = await analyticsService.getCollegePerformance(superAdminUserId);
      const row = rows.find((candidate) => candidate.collegeId === collegeId);
      expect(row).toBeDefined();
      expect(row?.attemptCount).toBe(0);
      expect(row?.averageScorePercent).toBeNull();
    });
  });

  describe('getCategoryImprovement', () => {
    it('returns an empty array when there are zero submitted mcq attempts in scope', async () => {
      const rows = await analyticsService.getCategoryImprovement(collegeId, superAdminUserId);
      expect(rows).toEqual([]);
    });
  });
});
