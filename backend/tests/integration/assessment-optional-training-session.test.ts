import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { assessmentsService } from '../../src/modules/assessments/assessments.service';
import { NotFoundError } from '../../src/shared/errors/app-error';
import {
  createRegistry,
  setupWithCleanup,
  cleanupRegistry,
  makeUser,
  createDraftAssessment,
  type FixtureRegistry,
} from './helpers';

// Regression coverage for item 4 (decision doc): trainingSessionId is now
// optional at assessment creation — assessment_batches, not training
// session, is the mechanism that actually controls student visibility
// (item 8A's diagnosis), so requiring a session up front was pure friction
// with no authorization purpose behind it.
describe('createAssessment allows an omitted trainingSessionId', () => {
  const registry: FixtureRegistry = createRegistry();
  let actorId: string;

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const actor = await makeUser(registry, 'no-session-actor');
      actorId = actor.id;
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  it('creates successfully with trainingSessionId omitted, stored as null', async () => {
    const assessment = await createDraftAssessment(
      registry,
      {
        title: 'No training session test assessment',
        testCategory: 'mcq',
      },
      actorId,
    );

    expect(assessment.trainingSessionId).toBeNull();
    expect(assessment.status).toBe('draft');
  });

  it('still 404s on an explicitly-provided but nonexistent trainingSessionId', async () => {
    // Confirms the optional-ness didn't accidentally weaken the existence
    // check for callers that DO provide one — omitted and invalid are
    // different things, only the first should be accepted.
    await expect(
      createDraftAssessment(
        registry,
        {
          title: 'Bad training session test assessment',
          testCategory: 'mcq',
          trainingSessionId: '00000000-0000-0000-0000-000000000000',
        },
        actorId,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
