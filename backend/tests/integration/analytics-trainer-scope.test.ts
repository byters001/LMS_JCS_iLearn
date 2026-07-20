import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { analyticsService } from '../../src/modules/analytics/analytics.service';
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
  type FixtureRegistry,
} from './helpers';

// Item 6 follow-up — analytics.service.ts's assertCanAccessBatch used to
// check only "does this batch's college match the caller's
// activeCollegeId," which let a Faculty caller view performance analytics
// for ANY batch in their own college, not just batches they're actually
// assigned to (batch_trainers). Tightened to a real batch_trainers-backed
// check, matching the exact assessments/questions fix shape (userHasRole
// bypass for super_admin, listBatchAssignmentsForTrainers([userId]) for
// everyone else). getBatchAssessmentParticipation is used as the test
// target rather than getBatchPerformance — it gracefully handles a batch
// with zero assessments/attempts (empty arrays, not a NotFoundError),
// isolating the AUTHORIZATION boundary from needing real attempt fixtures.
describe('item 6 follow-up — Analytics batch access tightened to real assignment', () => {
  const registry: FixtureRegistry = createRegistry();
  let actorId: string;
  let assignedFacultyId: string;
  let superAdminUserId: string;
  let assignedBatchId: string;
  let sameCollegeOtherBatchId: string;

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const actor = await makeUser(registry, 'a6-actor');
      actorId = actor.id;

      const college = await makeCollege(registry, actorId);
      const department = await makeDepartment(registry, college.id, actorId);
      const program = await makeTrainingProgram(registry, college.id, department.id, actorId);

      const assignedBatch = await makeBatch(registry, program.id, actorId);
      assignedBatchId = assignedBatch.id;
      // Same college as assignedBatch, but the faculty below is NEVER
      // assigned to this one via batch_trainers — this is the specific
      // case the old college-only check would have wrongly allowed.
      const sameCollegeOtherBatch = await makeBatch(registry, program.id, actorId);
      sameCollegeOtherBatchId = sameCollegeOtherBatch.id;

      const facultyRole = await usersService.findRoleBySlug('faculty');
      const superAdminRole = await usersService.findRoleBySlug('super_admin');

      const assignedFaculty = await makeUser(registry, 'a6-assigned-faculty');
      assignedFacultyId = assignedFaculty.id;
      await usersService.assignRole(
        assignedFacultyId,
        { roleId: facultyRole.id, collegeId: college.id },
        actorId,
      );
      await organizationService.assignTrainerToBatch(
        assignedBatchId,
        { trainerId: assignedFacultyId },
        actorId,
        true,
        actorId,
      );

      const superAdminUser = await makeUser(registry, 'a6-super-admin');
      superAdminUserId = superAdminUser.id;
      await usersService.assignRole(superAdminUserId, { roleId: superAdminRole.id }, actorId);
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  it('allows a Faculty caller to access a batch they are actually assigned to via batch_trainers', async () => {
    const result = await analyticsService.getBatchAssessmentParticipation(
      assignedBatchId,
      assignedFacultyId,
    );
    expect(result.batchId).toBe(assignedBatchId);
    expect(result.totalStudents).toBe(0);
  });

  it('rejects a Faculty caller reading a DIFFERENT batch in the SAME college they are not assigned to — the exact gap the old college-only check missed', async () => {
    await expect(
      analyticsService.getBatchAssessmentParticipation(
        sameCollegeOtherBatchId,
        assignedFacultyId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('leaves a Super Admin caller fully unscoped — accesses both batches despite zero batch_trainers assignments of their own', async () => {
    const assigned = await analyticsService.getBatchAssessmentParticipation(
      assignedBatchId,
      superAdminUserId,
    );
    expect(assigned.batchId).toBe(assignedBatchId);

    const other = await analyticsService.getBatchAssessmentParticipation(
      sameCollegeOtherBatchId,
      superAdminUserId,
    );
    expect(other.batchId).toBe(sameCollegeOtherBatchId);
  });

  // --- CRITICAL: the activeCollegeId === null bypass (item 6, fix 3) ---
  describe('a Faculty caller with multiple role assignments (activeCollegeId collapses to null)', () => {
    let multiRoleFacultyId: string;

    beforeAll(async () => {
      await setupWithCleanup(registry, async () => {
        // auth.service.ts's resolveActiveCollegeId returns null unless the
        // caller holds EXACTLY ONE role assignment with a non-null
        // college_id — assigning the SAME faculty role at TWO different
        // colleges reproduces that null-collapse for a genuinely
        // non-super_admin user, without touching auth/login at all (this
        // test calls analyticsService directly, at the service layer, the
        // same way every other item-6 test does).
        const secondCollege = await makeCollege(registry, actorId);
        const thirdCollege = await makeCollege(registry, actorId);

        const multiRoleFaculty = await makeUser(registry, 'a6-multirole-faculty');
        multiRoleFacultyId = multiRoleFaculty.id;
        const facultyRole = await usersService.findRoleBySlug('faculty');
        await usersService.assignRole(
          multiRoleFacultyId,
          { roleId: facultyRole.id, collegeId: secondCollege.id },
          actorId,
        );
        // Second assignment, a DIFFERENT college — now assignments.length
        // === 2, so resolveActiveCollegeId (were this user to log in for
        // real) would return null, the exact condition that used to make
        // the old check skip authorization entirely.
        await usersService.assignRole(
          multiRoleFacultyId,
          { roleId: facultyRole.id, collegeId: thirdCollege.id },
          actorId,
        );
      });
    }, 60_000);

    it('is still correctly REJECTED for a batch they are not assigned to — not bypassed to unrestricted access', async () => {
      await expect(
        analyticsService.getBatchAssessmentParticipation(assignedBatchId, multiRoleFacultyId),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        analyticsService.getBatchAssessmentParticipation(
          sameCollegeOtherBatchId,
          multiRoleFacultyId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('is still correctly ALLOWED for a batch they ARE actually assigned to via batch_trainers', async () => {
      await organizationService.assignTrainerToBatch(
        sameCollegeOtherBatchId,
        { trainerId: multiRoleFacultyId },
        actorId,
        true,
        actorId,
      );

      const result = await analyticsService.getBatchAssessmentParticipation(
        sameCollegeOtherBatchId,
        multiRoleFacultyId,
      );
      expect(result.batchId).toBe(sameCollegeOtherBatchId);
    });
  });
});
