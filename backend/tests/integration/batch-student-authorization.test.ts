import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/db/client';
import { trainingProgramStudents } from '../../src/db/schema/students.schema';
import { organizationService } from '../../src/modules/organization/organization.service';
import { studentsService } from '../../src/modules/students/students.service';
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

// Regression coverage for the fix replacing createStudentsInBatch's former
// unconditional "Faculty rejected regardless of batch" placeholder (a
// leftover from before batch_trainers/Phase 4 existed) with a real
// organizationService.isTrainerAssignedToBatch check. Also covers
// exportStudentsCsv's matching tightening (college-match alone used to be
// enough; now also requires the same per-batch assignment).
describe('per-trainer batch-student authorization', () => {
  const registry: FixtureRegistry = createRegistry();
  let actorId: string;
  let collegeId: string;
  let batchId: string;
  let assignedFacultyId: string;
  let unassignedFacultyId: string;

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const actor = await makeUser(registry, 'authz-actor');
      actorId = actor.id;
      const college = await makeCollege(registry, actorId);
      collegeId = college.id;
      const department = await makeDepartment(registry, college.id, actorId);
      const program = await makeTrainingProgram(registry, college.id, department.id, actorId);
      const batch = await makeBatch(registry, program.id, actorId);
      batchId = batch.id;

      const assignedFaculty = await makeUser(registry, 'authz-assigned-faculty');
      assignedFacultyId = assignedFaculty.id;
      const unassignedFaculty = await makeUser(registry, 'authz-unassigned-faculty');
      unassignedFacultyId = unassignedFaculty.id;

      // Real assignment via the actual Phase 4 service function, not a raw
      // insert — actorId as a Super Admin caller (isSuperAdmin: true).
      await organizationService.assignTrainerToBatch(
        batchId,
        { trainerId: assignedFacultyId },
        actorId,
        true,
        actorId,
      );
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  it('rejects a Faculty caller who is NOT assigned to this batch (add students)', async () => {
    await expect(
      studentsService.createStudentsInBatch(
        batchId,
        {
          students: [
            {
              fullName: 'Should Not Be Created',
              email: `authz-rejected-${randomUUID()}@jcs-ilearn.test`,
            },
          ],
        },
        collegeId,
        unassignedFacultyId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows a Faculty caller who IS assigned to this batch (add students)', async () => {
    const result = await studentsService.createStudentsInBatch(
      batchId,
      {
        students: [
          {
            fullName: 'Test Assigned-Faculty Student',
            email: `authz-allowed-${randomUUID()}@jcs-ilearn.test`,
          },
        ],
      },
      collegeId,
      assignedFacultyId,
    );

    expect(result.created).toHaveLength(1);
    const created = result.created[0]!;
    registry.userIds.add(created.userId);
    registry.studentProfileIds.add(created.studentProfileId);

    // Same FK-safe cleanup registration as batch-deactivation.test.ts —
    // createStudentsInBatch's own result doesn't expose the
    // training_program_students row it creates.
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

  it('rejects a Faculty caller who is NOT assigned to this batch (export CSV)', async () => {
    await expect(
      studentsService.exportStudentsCsv(batchId, {}, collegeId, unassignedFacultyId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows a Faculty caller who IS assigned to this batch (export CSV)', async () => {
    const csv = await studentsService.exportStudentsCsv(batchId, {}, collegeId, assignedFacultyId);
    expect(csv).toContain('full_name,email,reg_no,department,status');
  });
});
