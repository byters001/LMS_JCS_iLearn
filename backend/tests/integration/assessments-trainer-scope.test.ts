import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { assessmentsRepository } from '../../src/modules/assessments/assessments.repository';
import { assessmentsService } from '../../src/modules/assessments/assessments.service';
import { organizationService } from '../../src/modules/organization/organization.service';
import { usersService } from '../../src/modules/users/users.service';
import {
  createRegistry,
  setupWithCleanup,
  cleanupRegistry,
  makeUser,
  makeCollege,
  makeDepartment,
  makeTrainingProgram,
  makeBatch,
  createDraftAssessment,
  type FixtureRegistry,
} from './helpers';

// Item 6 — GET /assessments (assessmentsService.listAssessments) was
// unscoped for every caller holding 'assessments.create', which schema.sql
// grants to BOTH super_admin and faculty. This is a real BEHAVIOR CHANGE
// for faculty, not a pure bug fix (see assessments.service.ts's own
// resolveAssessmentListBatchScope comment) — a Faculty caller must now see
// only assessments linked (via assessment_batches) to a batch they're
// actually assigned to (batch_trainers), while a Super Admin caller's view
// must stay completely unscoped, exactly as it was before this fix.
describe('item 6 — GET /assessments faculty batch-scoping', () => {
  const registry: FixtureRegistry = createRegistry();
  let actorId: string;
  let superAdminUserId: string;
  let assignedFacultyId: string;
  let unassignedFacultyId: string;
  let assignedBatchId: string;
  let otherBatchId: string;
  let assignedAssessmentId: string;
  let otherAssessmentId: string;

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const actor = await makeUser(registry, 'item6-actor');
      actorId = actor.id;

      const college = await makeCollege(registry, actorId);
      const department = await makeDepartment(registry, college.id, actorId);
      const program = await makeTrainingProgram(registry, college.id, department.id, actorId);

      const assignedBatch = await makeBatch(registry, program.id, actorId);
      assignedBatchId = assignedBatch.id;
      const otherBatch = await makeBatch(registry, program.id, actorId);
      otherBatchId = otherBatch.id;

      const facultyRole = await usersService.findRoleBySlug('faculty');
      const superAdminRole = await usersService.findRoleBySlug('super_admin');

      // Assigned as trainer to assignedBatch only — should see
      // assignedAssessment, must NOT see otherAssessment.
      const assignedFaculty = await makeUser(registry, 'item6-assigned-faculty');
      assignedFacultyId = assignedFaculty.id;
      await usersService.assignRole(assignedFacultyId, { roleId: facultyRole.id }, actorId);
      await organizationService.assignTrainerToBatch(
        assignedBatchId,
        { trainerId: assignedFacultyId },
        actorId,
        true,
        actorId,
      );

      // Faculty, but assigned to NO batch at all — the "assigned to zero
      // batches" edge case assessments.repository.ts's own comment calls
      // out: must see nothing, not fall through to the unscoped view.
      const unassignedFaculty = await makeUser(registry, 'item6-unassigned-faculty');
      unassignedFacultyId = unassignedFaculty.id;
      await usersService.assignRole(unassignedFacultyId, { roleId: facultyRole.id }, actorId);

      // Super Admin — deliberately assigned to NO batch either, so if the
      // scoping fix ever accidentally caught super_admin too, this test
      // would fail loudly (empty/wrong result) instead of coincidentally
      // passing because they happened to be assigned somewhere.
      const superAdminUser = await makeUser(registry, 'item6-super-admin');
      superAdminUserId = superAdminUser.id;
      await usersService.assignRole(superAdminUserId, { roleId: superAdminRole.id }, actorId);

      const assignedAssessment = await createDraftAssessment(
        registry,
        {
          title: `Item6 Assigned Assessment ${Date.now()}`,
          testCategory: 'mcq',
          batchIds: [assignedBatchId],
        },
        actorId,
      );
      assignedAssessmentId = assignedAssessment.id;

      const otherAssessment = await createDraftAssessment(
        registry,
        {
          title: `Item6 Other Assessment ${Date.now()}`,
          testCategory: 'mcq',
          batchIds: [otherBatchId],
        },
        actorId,
      );
      otherAssessmentId = otherAssessment.id;
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  it('scopes a Faculty caller to only assessments linked to a batch they are assigned to', async () => {
    const result = await assessmentsService.listAssessments(assignedFacultyId, {
      page: 1,
      pageSize: 50,
    });

    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(assignedAssessmentId);
    expect(ids).not.toContain(otherAssessmentId);
  });

  it('returns an empty list for a Faculty caller assigned to zero batches, not the unscoped platform list', async () => {
    const result = await assessmentsService.listAssessments(unassignedFacultyId, {
      page: 1,
      pageSize: 50,
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('leaves a Super Admin caller fully unscoped — sees both assessments despite zero batch assignments of their own', async () => {
    const result = await assessmentsService.listAssessments(superAdminUserId, {
      page: 1,
      pageSize: 50,
    });

    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(assignedAssessmentId);
    expect(ids).toContain(otherAssessmentId);
  });

  it("Super Admin's result is byte-for-byte identical to calling the repository directly with no batch filter — the exact pre-fix code path", async () => {
    const query = { page: 1 as const, pageSize: 100 };

    const viaService = await assessmentsService.listAssessments(superAdminUserId, query);
    const viaRepositoryUnfiltered = await assessmentsRepository.listAssessments({
      page: query.page,
      pageSize: query.pageSize,
      // batchIds omitted entirely (undefined) — this is literally what
      // every call to this function looked like before item 6.
    });

    expect(viaService.total).toBe(viaRepositoryUnfiltered.total);
    expect(viaService.items.map((item) => item.id)).toEqual(
      viaRepositoryUnfiltered.items.map((item) => item.id),
    );
  });
});
