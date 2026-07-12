import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { attemptQuestionSelections } from '../../src/db/schema/attempts.schema';
import { attemptsService } from '../../src/modules/attempts/attempts.service';
import { assessmentsService } from '../../src/modules/assessments/assessments.service';
import { ConflictError } from '../../src/shared/errors/app-error';
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

describe('attempts integration', () => {
  describe('startAttempt freeze-once + getAttemptQuestions sanitization', () => {
    const registry: FixtureRegistry = createRegistry();
    let studentUserId: string;
    let assessmentId: string;
    let firstAttemptId: string;

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
          staff.id,
        );

        const psychometric = await makeApprovedQuestion(
          registry,
          {
            type: 'psychometric',
            difficulty: 'easy',
            questionText: 'I enjoy working in teams.',
            marks: 1,
            psychometricDetails: { traitCategory: 'teamwork', scaleType: 'likert' },
            psychometricOptions: [
              { optionText: 'Strongly disagree', traitWeight: 1, sortOrder: 0 },
              { optionText: 'Strongly agree', traitWeight: 5, sortOrder: 1 },
            ],
          },
          staff.id,
        );

        const coding = await makeApprovedQuestion(
          registry,
          {
            type: 'coding',
            difficulty: 'medium',
            questionText: 'Print "hello".',
            marks: 5,
            codingDetails: {
              problemStatement: 'Print the string hello to stdout.',
              timeLimitMs: 2000,
              memoryLimitKb: 65536,
              supportedLanguages: ['PYTHON3'],
            },
            testCases: [
              { input: '', expectedOutput: 'hello', isHidden: false, points: 5, sortOrder: 0 },
              { input: '', expectedOutput: 'hello', isHidden: true, points: 5, sortOrder: 1 },
            ],
          },
          staff.id,
        );

        const assessment = await createDraftAssessment(
          registry,
          {
            trainingSessionId: session.id,
            title: 'Freeze-once + sanitization test assessment',
            testCategory: 'mixed',
            maxAttempts: 3,
            batchIds: [batch.id],
          },
          staff.id,
        );
        assessmentId = assessment.id;

        const section = await assessmentsService.createAssessmentSection(
          assessmentId,
          { title: 'Section 1' },
          staff.id,
        );
        await assessmentsService.createAssessmentQuestion(assessmentId, section.id, {
          questionVersionId: mcq.currentVersion!.id,
        });
        await assessmentsService.createAssessmentQuestion(assessmentId, section.id, {
          questionVersionId: psychometric.currentVersion!.id,
        });
        await assessmentsService.createAssessmentQuestion(assessmentId, section.id, {
          questionVersionId: coding.currentVersion!.id,
        });

        await publishDraftAssessment(assessmentId, staff.id);
      });
    });

    afterAll(async () => {
      await cleanupRegistry(registry);
    });

    it('returns the same attempt and freezes selections exactly once across repeated calls', async () => {
      const first = await attemptsService.startAttempt(studentUserId, assessmentId, {});
      trackAttempt(registry, first.id);
      firstAttemptId = first.id;

      const second = await attemptsService.startAttempt(studentUserId, assessmentId, {});
      expect(second.id).toBe(first.id);

      const selectionsAfterSecond = await db
        .select()
        .from(attemptQuestionSelections)
        .where(eq(attemptQuestionSelections.attemptId, first.id));
      expect(selectionsAfterSecond.length).toBe(3);

      const third = await attemptsService.startAttempt(studentUserId, assessmentId, {});
      expect(third.id).toBe(first.id);

      const selectionsAfterThird = await db
        .select()
        .from(attemptQuestionSelections)
        .where(eq(attemptQuestionSelections.attemptId, first.id));
      expect(selectionsAfterThird.length).toBe(3);
    });

    it('never leaks is_correct, trait_weight, or hidden test case fields', async () => {
      const questions = await attemptsService.getAttemptQuestions(studentUserId, firstAttemptId);
      expect(questions).toHaveLength(3);

      const mcqQuestion = questions.find((q) => q.type === 'mcq');
      expect(mcqQuestion?.options).toBeDefined();
      for (const option of mcqQuestion!.options!) {
        expect(option).not.toHaveProperty('isCorrect');
      }

      const psychometricQuestion = questions.find((q) => q.type === 'psychometric');
      expect(psychometricQuestion?.psychometricOptions).toBeDefined();
      for (const option of psychometricQuestion!.psychometricOptions!) {
        expect(option).not.toHaveProperty('traitWeight');
      }

      const codingQuestion = questions.find((q) => q.type === 'coding');
      expect(codingQuestion?.coding).toBeDefined();
      // Only the visible test case should be present — the hidden one must
      // never reach the student, and `points` (scoring metadata) must never
      // be exposed even on the visible one.
      expect(codingQuestion!.coding!.sampleTestCases).toHaveLength(1);
      for (const testCase of codingQuestion!.coding!.sampleTestCases) {
        expect(testCase).not.toHaveProperty('points');
        expect(testCase).not.toHaveProperty('isHidden');
      }
    });
  });

  describe('maxAttempts gate + approved retake request raises the ceiling', () => {
    const registry: FixtureRegistry = createRegistry();
    let studentUserId: string;
    let staffUserId: string;
    let assessmentId: string;
    let firstAttemptId: string;

    beforeAll(async () => {
      await setupWithCleanup(registry, async () => {
        const staff = await makeUser(registry, 'staff');
        staffUserId = staff.id;
        const college = await makeCollege(registry, staff.id);
        const department = await makeDepartment(registry, college.id, staff.id);
        const program = await makeTrainingProgram(registry, college.id, department.id, staff.id);
        const batch = await makeBatch(registry, program.id, staff.id);
        const session = await makeTrainingSession(registry, program.id, staff.id);
        const { user: studentUser, profile } = await makeStudent(registry, college.id, staff.id);
        studentUserId = studentUser.id;
        await enrollStudentInBatch(registry, program.id, profile.id, batch.id, staff.id);

        const mcq = await makeApprovedQuestion(
          registry,
          {
            type: 'mcq',
            difficulty: 'easy',
            questionText: 'What is 3 + 3?',
            marks: 1,
            options: [
              { optionText: '5', isCorrect: false, sortOrder: 0 },
              { optionText: '6', isCorrect: true, sortOrder: 1 },
            ],
          },
          staff.id,
        );

        const assessment = await createDraftAssessment(
          registry,
          {
            trainingSessionId: session.id,
            title: 'maxAttempts + retake test assessment',
            testCategory: 'mcq',
            maxAttempts: 1,
            batchIds: [batch.id],
          },
          staff.id,
        );
        assessmentId = assessment.id;

        const section = await assessmentsService.createAssessmentSection(
          assessmentId,
          { title: 'Section 1' },
          staff.id,
        );
        await assessmentsService.createAssessmentQuestion(assessmentId, section.id, {
          questionVersionId: mcq.currentVersion!.id,
        });

        await publishDraftAssessment(assessmentId, staff.id);
      });
    });

    afterAll(async () => {
      await cleanupRegistry(registry);
    });

    it('blocks a new attempt at maxAttempts, then unblocks after an approved retake request', async () => {
      const first = await attemptsService.startAttempt(studentUserId, assessmentId, {});
      trackAttempt(registry, first.id);
      firstAttemptId = first.id;
      expect(first.attemptNumber).toBe(1);

      await attemptsService.submitAttempt(studentUserId, first.id);

      await expect(attemptsService.startAttempt(studentUserId, assessmentId, {})).rejects.toThrow(
        ConflictError,
      );

      const retakeRequest = await attemptsService.createRetakeRequest(studentUserId, firstAttemptId, {
        reason: 'Network dropped mid-assessment',
      });
      await attemptsService.approveRetakeRequest(retakeRequest.id, staffUserId);

      const second = await attemptsService.startAttempt(studentUserId, assessmentId, {});
      trackAttempt(registry, second.id);
      expect(second.id).not.toBe(first.id);
      expect(second.attemptNumber).toBe(2);
      expect(second.isRetake).toBe(true);
    });
  });
});
