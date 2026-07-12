import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkJudge0Reachable } from '../../src/integrations/judge0/client';
import { attemptsService } from '../../src/modules/attempts/attempts.service';
import { assessmentsService } from '../../src/modules/assessments/assessments.service';
import {
  createRegistry,
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
  cleanupRegistry,
  setupWithCleanup,
  type FixtureRegistry,
} from './helpers';

// Real Judge0 required — this suite makes real HTTP calls through
// integrations/judge0/submission.service.ts (via codingService.gradeSubmission,
// via attemptsService.submitCode). checkJudge0Reachable is the same
// lightweight one-shot check plugins/health.plugin.ts's /readyz uses.
// Confirmed reachable at localhost:2358 via a live curl check earlier this
// session; this top-level await gates the whole suite so a machine without
// Judge0 running gets a clean skip instead of 20s-timeout failures.
const judge0Available = await checkJudge0Reachable();

describe.skipIf(!judge0Available)('attempts.submitCode best-score-wins grading (requires Judge0)', () => {
  const registry: FixtureRegistry = createRegistry();
  let studentUserId: string;
  let attemptId: string;
  let noOverwriteQuestionVersionId: string;
  let improveQuestionVersionId: string;

  beforeAll(async () => {
    await setupWithCleanup(registry, async () => {
      const staff = await makeUser(registry, 'staff');
      const college = await makeCollege(registry, staff.id);
      const department = await makeDepartment(registry, college.id, staff.id);
      const program = await makeTrainingProgram(registry, college.id, department.id, staff.id);
      const batch = await makeBatch(registry, program.id, staff.id);
      const session = await makeTrainingSession(registry, program.id, staff.id);
      const { user: studentUser, profile } = await makeStudent(registry, college.id, staff.id);
      studentUserId = studentUser.id;
      await enrollStudentInBatch(registry, program.id, profile.id, batch.id, staff.id);

      const codingDetails = {
        problemStatement: 'Print the exact string "hello" to stdout.',
        timeLimitMs: 5000,
        memoryLimitKb: 65536,
        supportedLanguages: ['PYTHON3'] as string[],
      };
      const testCases = [{ input: '', expectedOutput: 'hello', isHidden: false, points: 5, sortOrder: 0 }];

      const noOverwriteQuestion = await makeApprovedQuestion(
        registry,
        {
          type: 'coding',
          difficulty: 'easy',
          questionText: 'Best-score-wins fixture — no overwrite by a worse resubmission',
          marks: 5,
          codingDetails,
          testCases,
        },
        staff.id,
      );
      noOverwriteQuestionVersionId = noOverwriteQuestion.currentVersion!.id;

      const improveQuestion = await makeApprovedQuestion(
        registry,
        {
          type: 'coding',
          difficulty: 'easy',
          questionText: 'Best-score-wins fixture — overwrite by a better resubmission',
          marks: 5,
          codingDetails,
          testCases,
        },
        staff.id,
      );
      improveQuestionVersionId = improveQuestion.currentVersion!.id;

      const assessment = await createDraftAssessment(
        registry,
        {
          trainingSessionId: session.id,
          title: 'submitCode best-score-wins test assessment',
          testCategory: 'coding',
          maxAttempts: 1,
          batchIds: [batch.id],
        },
        staff.id,
      );

      const section = await assessmentsService.createAssessmentSection(
        assessment.id,
        { title: 'Section 1' },
        staff.id,
      );
      await assessmentsService.createAssessmentQuestion(assessment.id, section.id, {
        questionVersionId: noOverwriteQuestionVersionId,
      });
      await assessmentsService.createAssessmentQuestion(assessment.id, section.id, {
        questionVersionId: improveQuestionVersionId,
      });

      await publishDraftAssessment(assessment.id, staff.id);

      const attempt = await attemptsService.startAttempt(studentUserId, assessment.id, {});
      trackAttempt(registry, attempt.id);
      attemptId = attempt.id;
    });
  });

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  it('does not let a worse resubmission overwrite an already-correct grade', async () => {
    const correct = await attemptsService.submitCode(studentUserId, attemptId, noOverwriteQuestionVersionId, {
      language: 'PYTHON3',
      sourceCode: 'print("hello")',
    });
    expect(correct.isCorrect).toBe(true);
    expect(Number(correct.marksObtained)).toBe(5);

    const afterWorseResubmission = await attemptsService.submitCode(
      studentUserId,
      attemptId,
      noOverwriteQuestionVersionId,
      { language: 'PYTHON3', sourceCode: 'print("wrong")' },
    );
    expect(afterWorseResubmission.isCorrect).toBe(true);
    expect(Number(afterWorseResubmission.marksObtained)).toBe(5);
  });

  it('lets a better resubmission overwrite a worse prior grade', async () => {
    const wrong = await attemptsService.submitCode(studentUserId, attemptId, improveQuestionVersionId, {
      language: 'PYTHON3',
      sourceCode: 'print("wrong")',
    });
    expect(wrong.isCorrect).toBe(false);
    expect(Number(wrong.marksObtained)).toBe(0);

    const afterBetterResubmission = await attemptsService.submitCode(
      studentUserId,
      attemptId,
      improveQuestionVersionId,
      { language: 'PYTHON3', sourceCode: 'print("hello")' },
    );
    expect(afterBetterResubmission.isCorrect).toBe(true);
    expect(Number(afterBetterResubmission.marksObtained)).toBe(5);
  });
});
