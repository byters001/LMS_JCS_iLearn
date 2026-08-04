import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { analyticsService } from '../../src/modules/analytics/analytics.service';
import { assessmentsService } from '../../src/modules/assessments/assessments.service';
import { organizationService } from '../../src/modules/organization/organization.service';
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
  createDraftAssessment,
  publishDraftAssessment,
  type FixtureRegistry,
} from './helpers';

// Phase 3 — Faculty's own analytics (getMyOverview/getMyBatchPerformance/
// getMyCategoryImprovement), self-scoped via batch_trainers rather than
// college. The real thing under test: a faculty member with 2 assigned
// batches aggregates across EXACTLY those 2 — a third, unassigned batch's
// students/assessments must never leak in, and narrowing to a
// not-actually-assigned batchId must be rejected the same way
// assertCanAccessBatch already rejects it elsewhere in this module.
describe('Faculty analytics — batch_trainers scoping (Phase 3)', () => {
  const registry: FixtureRegistry = createRegistry();
  let actorId: string;
  let facultyUserId: string;
  let emptyFacultyUserId: string;
  let batchAId: string;
  let batchBId: string;
  let batchCId: string; // NOT assigned to the faculty — the negative case

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const actor = await makeUser(registry, 'my-actor');
      actorId = actor.id;

      const college = await makeCollege(registry, actorId);
      const department = await makeDepartment(registry, college.id, actorId);
      const program = await makeTrainingProgram(registry, college.id, department.id, actorId);

      const batchA = await makeBatch(registry, program.id, actorId);
      batchAId = batchA.id;
      const batchB = await makeBatch(registry, program.id, actorId);
      batchBId = batchB.id;
      const batchC = await makeBatch(registry, program.id, actorId);
      batchCId = batchC.id;

      const studentA = await makeStudent(registry, college.id, actorId);
      await enrollStudentInBatch(registry, program.id, studentA.profile.id, batchAId, actorId);
      const studentB = await makeStudent(registry, college.id, actorId);
      await enrollStudentInBatch(registry, program.id, studentB.profile.id, batchBId, actorId);
      const studentC = await makeStudent(registry, college.id, actorId);
      await enrollStudentInBatch(registry, program.id, studentC.profile.id, batchCId, actorId);

      // One live assessment, assigned ONLY to batch A — real signal that
      // getMyOverview's activeAssessments count is genuinely batch-scoped,
      // not just "every assessment across every batch this trainer touches."
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
        { title: 'Faculty analytics fixture assessment', testCategory: 'mcq', batchIds: [batchAId] },
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

      const facultyRole = await usersService.findRoleBySlug('faculty');
      const facultyUser = await makeUser(registry, 'my-faculty');
      facultyUserId = facultyUser.id;
      await usersService.assignRole(
        facultyUserId,
        { roleId: facultyRole.id, collegeId: college.id },
        actorId,
      );
      // Assigned to A and B only — C is deliberately left unassigned.
      await organizationService.assignTrainerToBatch(
        batchAId,
        { trainerId: facultyUserId },
        actorId,
        true,
        actorId,
      );
      await organizationService.assignTrainerToBatch(
        batchBId,
        { trainerId: facultyUserId },
        actorId,
        true,
        actorId,
      );

      // A second faculty with zero batch assignments — the "empty" case.
      const emptyFacultyUser = await makeUser(registry, 'my-empty-faculty');
      emptyFacultyUserId = emptyFacultyUser.id;
      await usersService.assignRole(
        emptyFacultyUserId,
        { roleId: facultyRole.id, collegeId: college.id },
        actorId,
      );
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  describe('getMyOverview', () => {
    it('aggregates across exactly the 2 assigned batches when unscoped — 2 students (A+B), 1 active assessment, batch C excluded', async () => {
      const result = await analyticsService.getMyOverview(facultyUserId, undefined);
      expect(result.totalBatches).toBe(2);
      expect(result.totalStudents).toBe(2);
      expect(result.activeAssessments).toBe(1);
      expect(result.averageScorePercent).toBeNull();
      // 2 students, 0 submitted attempts -> 0, not null (null is reserved
      // for totalStudents === 0).
      expect(result.completionRate).toBe(0);
    });

    it('narrows to batch A only when given its batchId — 1 student, 1 active assessment, totalBatches still 2', async () => {
      const result = await analyticsService.getMyOverview(facultyUserId, batchAId);
      expect(result.totalBatches).toBe(2); // always the FULL assignment count
      expect(result.totalStudents).toBe(1);
      expect(result.activeAssessments).toBe(1);
    });

    it('narrows to batch B only — 1 student, 0 active assessments (the fixture assessment is assigned to A, not B)', async () => {
      const result = await analyticsService.getMyOverview(facultyUserId, batchBId);
      expect(result.totalStudents).toBe(1);
      expect(result.activeAssessments).toBe(0);
    });

    it('rejects narrowing to batch C — the faculty is not assigned to it', async () => {
      await expect(analyticsService.getMyOverview(facultyUserId, batchCId)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it('returns graceful zeros/nulls for a faculty member with zero assigned batches, not an error', async () => {
      const result = await analyticsService.getMyOverview(emptyFacultyUserId, undefined);
      expect(result.totalBatches).toBe(0);
      expect(result.totalStudents).toBe(0);
      expect(result.activeAssessments).toBe(0);
      expect(result.averageScorePercent).toBeNull();
      expect(result.completionRate).toBeNull();
    });
  });

  describe('getMyBatchPerformance', () => {
    it('lists exactly the 2 assigned batches, not batch C, each with zero attempts', async () => {
      const rows = await analyticsService.getMyBatchPerformance(facultyUserId);
      const batchIds = rows.map((row) => row.batchId).sort();
      expect(batchIds).toEqual([batchAId, batchBId].sort());
      for (const row of rows) {
        expect(row.attemptCount).toBe(0);
        expect(row.averageScorePercent).toBeNull();
      }
    });

    it('returns an empty array for a faculty member with zero assigned batches', async () => {
      const rows = await analyticsService.getMyBatchPerformance(emptyFacultyUserId);
      expect(rows).toEqual([]);
    });
  });

  describe('getMyCategoryImprovement', () => {
    it('returns an empty array when there are zero submitted mcq attempts in scope', async () => {
      const rows = await analyticsService.getMyCategoryImprovement(facultyUserId, undefined);
      expect(rows).toEqual([]);
    });

    it('rejects narrowing to a batch the faculty is not assigned to', async () => {
      await expect(
        analyticsService.getMyCategoryImprovement(facultyUserId, batchCId),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
