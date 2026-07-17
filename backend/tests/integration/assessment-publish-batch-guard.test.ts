import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { assessmentsService } from '../../src/modules/assessments/assessments.service';
import { ConflictError } from '../../src/shared/errors/app-error';
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
  createDraftAssessment,
  publishDraftAssessment,
  type FixtureRegistry,
} from './helpers';

// Regression coverage for item 8A's live incident: two assessments reached
// 'live' status with zero assessment_batches rows and were silently
// invisible to every student (listAvailableAssessments inner-joins
// assessment_batches — no batch means no possible match, for anyone, ever).
// publishAssessment (assessments.service.ts) is the fix — this proves the
// guard actually rejects the scheduled->live transition when no batch is
// attached, and that a properly batch-attached assessment still publishes
// fine (the guard isn't accidentally blocking the happy path).
describe('publishAssessment requires at least one assessment_batches row', () => {
  const registry: FixtureRegistry = createRegistry();
  let actorId: string;
  let trainingSessionId: string;
  let batchId: string;

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const actor = await makeUser(registry, 'publish-guard-actor');
      actorId = actor.id;
      const college = await makeCollege(registry, actorId);
      const department = await makeDepartment(registry, college.id, actorId);
      const program = await makeTrainingProgram(registry, college.id, department.id, actorId);
      const batch = await makeBatch(registry, program.id, actorId);
      batchId = batch.id;
      const session = await makeTrainingSession(registry, program.id, actorId);
      trainingSessionId = session.id;
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  it('rejects publish with a ConflictError when no batch is attached', async () => {
    const assessment = await createDraftAssessment(
      registry,
      {
        trainingSessionId,
        title: 'No-batch publish-guard test assessment',
        testCategory: 'mcq',
      },
      actorId,
    );

    await expect(publishDraftAssessment(assessment.id, actorId)).rejects.toThrow(ConflictError);

    // Confirmed still stuck at 'scheduled', not silently promoted to
    // 'live' — the guard runs after scheduleAssessment already succeeded
    // (batches stay editable through 'scheduled', only publish is the
    // one-way door), so this is the exact status a rejected publish
    // attempt should leave behind.
    const stillScheduled = await assessmentsService.findAssessmentById(assessment.id);
    expect(stillScheduled.status).toBe('scheduled');
  });

  it('publishes successfully once a batch is attached', async () => {
    const assessment = await createDraftAssessment(
      registry,
      {
        trainingSessionId,
        title: 'Batch-attached publish-guard test assessment',
        testCategory: 'mcq',
        batchIds: [batchId],
      },
      actorId,
    );

    const published = await publishDraftAssessment(assessment.id, actorId);
    expect(published.status).toBe('live');
  });
});
