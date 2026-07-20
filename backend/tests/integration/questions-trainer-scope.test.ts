import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { questionBankRepository } from '../../src/modules/question-bank/question-bank.repository';
import { questionBankService } from '../../src/modules/question-bank/question-bank.service';
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
  makeApprovedQuestion,
  type FixtureRegistry,
} from './helpers';

// Item 6 follow-up — GET /questions was fully unscoped for every caller
// holding 'questions.manage'/'questions.manage_global', which schema.sql
// grants to BOTH super_admin and faculty ('questions.manage' is the
// "own/college" tier). collegeId was a purely optional, client-supplied
// query filter never derived from the caller's identity — a Faculty caller
// who omitted it saw the entire platform's question bank. Same severity as
// the original assessments gap, same fix shape (super_admin bypass via
// rbac/role-assignments.ts's userHasRole, batch_trainers-derived scope for
// everyone else) — except questions are COLLEGE-scoped, not batch-scoped,
// so the derived scope here is a set of college ids (via
// organizationService.listBatchAssignmentsForTrainers' own .collegeId,
// deduplicated), not batch ids.
describe('item 6 follow-up — GET /questions faculty college-scoping', () => {
  const registry: FixtureRegistry = createRegistry();
  let actorId: string;
  let assignedFacultyId: string;
  let unassignedFacultyId: string;
  let superAdminUserId: string;
  let assignedCollegeQuestionId: string;
  let otherCollegeQuestionId: string;
  let globalQuestionId: string;

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const actor = await makeUser(registry, 'q6-actor');
      actorId = actor.id;

      const assignedCollege = await makeCollege(registry, actorId);
      const assignedDepartment = await makeDepartment(registry, assignedCollege.id, actorId);
      const assignedProgram = await makeTrainingProgram(
        registry,
        assignedCollege.id,
        assignedDepartment.id,
        actorId,
      );
      const assignedBatch = await makeBatch(registry, assignedProgram.id, actorId);

      const otherCollege = await makeCollege(registry, actorId);

      const facultyRole = await usersService.findRoleBySlug('faculty');
      const superAdminRole = await usersService.findRoleBySlug('super_admin');

      const assignedFaculty = await makeUser(registry, 'q6-assigned-faculty');
      assignedFacultyId = assignedFaculty.id;
      await usersService.assignRole(assignedFacultyId, { roleId: facultyRole.id }, actorId);
      await organizationService.assignTrainerToBatch(
        assignedBatch.id,
        { trainerId: assignedFacultyId },
        actorId,
        true,
        actorId,
      );

      const unassignedFaculty = await makeUser(registry, 'q6-unassigned-faculty');
      unassignedFacultyId = unassignedFaculty.id;
      await usersService.assignRole(unassignedFacultyId, { roleId: facultyRole.id }, actorId);

      const superAdminUser = await makeUser(registry, 'q6-super-admin');
      superAdminUserId = superAdminUser.id;
      await usersService.assignRole(superAdminUserId, { roleId: superAdminRole.id }, actorId);

      const assignedCollegeQuestion = await makeApprovedQuestion(
        registry,
        {
          type: 'psychometric',
          difficulty: 'easy',
          questionText: `Item6 assigned-college question ${Date.now()}`,
          collegeId: assignedCollege.id,
        },
        actorId,
      );
      assignedCollegeQuestionId = assignedCollegeQuestion.id;

      const otherCollegeQuestion = await makeApprovedQuestion(
        registry,
        {
          type: 'psychometric',
          difficulty: 'easy',
          questionText: `Item6 other-college question ${Date.now()}`,
          collegeId: otherCollege.id,
        },
        actorId,
      );
      otherCollegeQuestionId = otherCollegeQuestion.id;

      const globalQuestion = await makeApprovedQuestion(
        registry,
        {
          type: 'psychometric',
          difficulty: 'easy',
          questionText: `Item6 global question ${Date.now()}`,
          // collegeId omitted entirely — global bank.
        },
        actorId,
      );
      globalQuestionId = globalQuestion.id;
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  it('scopes a Faculty caller to the global bank plus their own assigned college(s), not the whole platform', async () => {
    const result = await questionBankService.listQuestions(assignedFacultyId, {
      page: 1,
      pageSize: 100,
    });

    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(assignedCollegeQuestionId);
    expect(ids).toContain(globalQuestionId);
    expect(ids).not.toContain(otherCollegeQuestionId);
  });

  it('returns only the global bank for a Faculty caller assigned to zero batches', async () => {
    const result = await questionBankService.listQuestions(unassignedFacultyId, {
      page: 1,
      pageSize: 100,
    });

    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(globalQuestionId);
    expect(ids).not.toContain(assignedCollegeQuestionId);
    expect(ids).not.toContain(otherCollegeQuestionId);
  });

  it('leaves a Super Admin caller fully unscoped — sees every college plus the global bank', async () => {
    const result = await questionBankService.listQuestions(superAdminUserId, {
      page: 1,
      pageSize: 100,
    });

    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(assignedCollegeQuestionId);
    expect(ids).toContain(otherCollegeQuestionId);
    expect(ids).toContain(globalQuestionId);
  });

  it("Super Admin's result is byte-for-byte identical to calling the repository directly with no college filter — the exact pre-fix code path", async () => {
    const query = { page: 1 as const, pageSize: 200 };

    const viaService = await questionBankService.listQuestions(superAdminUserId, query);
    const viaRepositoryUnfiltered = await questionBankRepository.listQuestions({
      page: query.page,
      pageSize: query.pageSize,
      // collegeIds omitted entirely (undefined) — this is literally what
      // every call to this function looked like before item 6.
    });

    expect(viaService.total).toBe(viaRepositoryUnfiltered.total);
    expect(viaService.items.map((item) => item.id)).toEqual(
      viaRepositoryUnfiltered.items.map((item) => item.id),
    );
  });
});
