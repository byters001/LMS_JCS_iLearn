import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { questionBankService } from '../../src/modules/question-bank/question-bank.service';
import {
  createRegistry,
  makeUser,
  makeQuestionTopic,
  makeApprovedQuestion,
  cleanupRegistry,
  setupWithCleanup,
  type FixtureRegistry,
} from './helpers';

// Recreates the exact bug fixed this session in
// questionBankService.resolveQuestionPool: two criteria in the SAME pool
// both targeting difficulty='easy' (fully overlapping eligible sets), with
// combined demand (countRequired 2 + 1 = 3) exceeding the number of actually
// eligible questions (2). Before the fix, criteria were resolved in
// parallel (Promise.all) with no awareness of a sibling criterion's draw,
// so the same question_version_id could be selected by more than one
// criterion — harmless for this read-only endpoint, but a live UNIQUE
// constraint violation once attempts.startAttempt flattened and inserted
// the result into attempt_question_selections. The fix resolves criteria
// SEQUENTIALLY, threading a running excludeQuestionIds set forward.
//
// Both criteria are scoped to a freshly-created topic that ONLY this
// fixture's 2 questions carry (via topicId, which resolveCriterionQuestions
// turns into a WHERE EXISTS against question_topic_map) — this is real dev
// DB, not an isolated sandbox, so without this scoping the "eligible" set
// for a bare (difficulty='easy', type='mcq', collegeId=null) filter could
// include any other approved global mcq/easy question already sitting in
// the database from earlier work, making the test non-deterministic.
describe('question-bank resolveQuestionPool cross-criteria dedup', () => {
  const registry: FixtureRegistry = createRegistry();
  let poolId: string;
  let questionAId: string;
  let questionBId: string;

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const staff = await makeUser(registry, 'staff');
      const topic = await makeQuestionTopic(registry);

      const questionA = await makeApprovedQuestion(
        registry,
        {
          type: 'mcq',
          difficulty: 'easy',
          questionText: 'Dedup fixture question A',
          marks: 1,
          options: [
            { optionText: 'Option 1', isCorrect: true, sortOrder: 0 },
            { optionText: 'Option 2', isCorrect: false, sortOrder: 1 },
          ],
          topicIds: [topic.id],
        },
        staff.id,
      );
      questionAId = questionA.id;

      const questionB = await makeApprovedQuestion(
        registry,
        {
          type: 'mcq',
          difficulty: 'easy',
          questionText: 'Dedup fixture question B',
          marks: 1,
          options: [
            { optionText: 'Option 1', isCorrect: false, sortOrder: 0 },
            { optionText: 'Option 2', isCorrect: true, sortOrder: 1 },
          ],
          topicIds: [topic.id],
        },
        staff.id,
      );
      questionBId = questionB.id;

      const pool = await questionBankService.createQuestionPool(
        { name: `Dedup Test Pool ${Date.now()}`, type: 'mcq' },
        staff.id,
      );
      registry.questionPoolIds.add(pool.id);
      poolId = pool.id;

      // Criterion A is created first (the pool's own listQuestionPoolCriteria
      // ordering is ORDER BY created_at ASC — so this one resolves first) and
      // alone requires as many questions as exist for this topic (2) — it
      // will draw both of the only two eligible questions.
      await questionBankService.createQuestionPoolCriteria(poolId, {
        difficulty: 'easy',
        topicId: topic.id,
        countRequired: 2,
      });

      // Criterion B is created second (resolves second) and targets the
      // exact same difficulty + topic with no other distinguishing filter —
      // its eligible set, prior to dedup, is IDENTICAL to criterion A's.
      await questionBankService.createQuestionPoolCriteria(poolId, {
        difficulty: 'easy',
        topicId: topic.id,
        countRequired: 1,
      });
    });
  });

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  it('never selects the same question for two criteria in one resolution', async () => {
    const resolved = await questionBankService.resolveQuestionPool(poolId);

    expect(resolved.criteria).toHaveLength(2);
    const [criterionA, criterionB] = resolved.criteria;

    // Criterion A (created first, resolves first) draws both eligible
    // questions since count_required (2) matches the eligible total exactly.
    expect(criterionA.selected).toHaveLength(2);
    const criterionASelectedIds = criterionA.selected.map((q) => q.questionId).sort();
    expect(criterionASelectedIds).toEqual([questionAId, questionBId].sort());

    // Criterion B resolves AFTER A, with A's picks already excluded — since
    // both eligible questions were already taken by A, B has nothing left
    // to draw. Before the fix, B could have independently re-drawn one of
    // A's questions instead of correctly coming up empty.
    expect(criterionB.selected).toHaveLength(0);

    // The core dedup guarantee: no question_id appears in more than one
    // criterion's selected list anywhere in this resolution.
    const allSelectedIds = resolved.criteria.flatMap((criterion) =>
      criterion.selected.map((q) => q.questionId),
    );
    expect(new Set(allSelectedIds).size).toBe(allSelectedIds.length);

    expect(resolved.totalRequired).toBe(3);
    expect(resolved.totalSelected).toBe(2);
    expect(resolved.isFullySatisfied).toBe(false);

    // eligibleTotal is deliberately PRE-dedup (see resolveQuestionPool's own
    // module comment) — both criteria share the identical filter, so both
    // must report the same eligibleTotal regardless of what got drawn.
    expect(criterionA.eligibleTotal).toBe(2);
    expect(criterionB.eligibleTotal).toBe(2);
  });
});
