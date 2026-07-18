import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { attemptsService } from '../../src/modules/attempts/attempts.service';
import { assessmentsService } from '../../src/modules/assessments/assessments.service';
import { reportsService } from '../../src/modules/reports/reports.service';
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

// Drives the REAL startAttempt -> submitResponse -> submitAttempt flow for
// three students against one 2-question (5 marks each = 10 total possible)
// MCQ assessment, so each student's totalScore/status comes from the actual
// grading logic (attempts.service.ts's submitResponse/submitAttempt), not a
// fabricated row — the same "exercise the real service, don't reimplement
// its math in the test" discipline attempts.test.ts already follows.
async function answerBothQuestions(
  studentUserId: string,
  attemptId: string,
  q1VersionId: string,
  q1CorrectOptionId: string,
  q1PickCorrect: boolean,
  q2VersionId: string,
  q2CorrectOptionId: string,
  q2PickCorrect: boolean,
  q1WrongOptionId: string,
  q2WrongOptionId: string,
): Promise<void> {
  await attemptsService.submitResponse(studentUserId, attemptId, q1VersionId, {
    selectedOptionId: q1PickCorrect ? q1CorrectOptionId : q1WrongOptionId,
  });
  await attemptsService.submitResponse(studentUserId, attemptId, q2VersionId, {
    selectedOptionId: q2PickCorrect ? q2CorrectOptionId : q2WrongOptionId,
  });
}

describe('leaderboard integration (item 8B)', () => {
  describe('batch-scoped ranking, tiers, and isSelf', () => {
    const registry: FixtureRegistry = createRegistry();
    let studentAUserId: string;
    let studentAProfileId: string;
    let studentBUserId: string;
    let studentBProfileId: string;
    let studentCUserId: string;
    let studentCProfileId: string;

    beforeAll(async () => {
      await setupWithCleanup(registry, async () => {
        const staff = await makeUser(registry, 'leaderboard-staff');
        const college = await makeCollege(registry, staff.id);
        const department = await makeDepartment(registry, college.id, staff.id);
        const program = await makeTrainingProgram(registry, college.id, department.id, staff.id);
        const batch = await makeBatch(registry, program.id, staff.id);
        const session = await makeTrainingSession(registry, program.id, staff.id);

        const studentA = await makeStudent(registry, college.id, staff.id);
        const studentB = await makeStudent(registry, college.id, staff.id);
        const studentC = await makeStudent(registry, college.id, staff.id);
        studentAUserId = studentA.user.id;
        studentAProfileId = studentA.profile.id;
        studentBUserId = studentB.user.id;
        studentBProfileId = studentB.profile.id;
        studentCUserId = studentC.user.id;
        studentCProfileId = studentC.profile.id;
        await enrollStudentInBatch(registry, program.id, studentA.profile.id, batch.id, staff.id);
        await enrollStudentInBatch(registry, program.id, studentB.profile.id, batch.id, staff.id);
        await enrollStudentInBatch(registry, program.id, studentC.profile.id, batch.id, staff.id);

        const q1 = await makeApprovedQuestion(
          registry,
          {
            type: 'mcq',
            difficulty: 'easy',
            questionText: 'Leaderboard Q1: 2 + 2?',
            marks: 5,
            options: [
              { optionText: '3', isCorrect: false, sortOrder: 0 },
              { optionText: '4', isCorrect: true, sortOrder: 1 },
            ],
          },
          staff.id,
        );
        const q2 = await makeApprovedQuestion(
          registry,
          {
            type: 'mcq',
            difficulty: 'easy',
            questionText: 'Leaderboard Q2: 3 + 3?',
            marks: 5,
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
            title: 'Leaderboard test assessment',
            testCategory: 'mcq',
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
          questionVersionId: q1.currentVersion!.id,
        });
        await assessmentsService.createAssessmentQuestion(assessment.id, section.id, {
          questionVersionId: q2.currentVersion!.id,
        });
        await publishDraftAssessment(assessment.id, staff.id);

        const q1Correct = q1.currentVersion!.options.find((o) => o.isCorrect)!.id;
        const q1Wrong = q1.currentVersion!.options.find((o) => !o.isCorrect)!.id;
        const q2Correct = q2.currentVersion!.options.find((o) => o.isCorrect)!.id;
        const q2Wrong = q2.currentVersion!.options.find((o) => !o.isCorrect)!.id;

        // Student A: both correct -> 10/10 = 100%
        const attemptA = await attemptsService.startAttempt(studentA.user.id, assessment.id, {});
        trackAttempt(registry, attemptA.id);
        await answerBothQuestions(
          studentA.user.id,
          attemptA.id,
          q1.currentVersion!.id,
          q1Correct,
          true,
          q2.currentVersion!.id,
          q2Correct,
          true,
          q1Wrong,
          q2Wrong,
        );
        await attemptsService.submitAttempt(studentA.user.id, attemptA.id);

        // Student B: one correct -> 5/10 = 50%
        const attemptB = await attemptsService.startAttempt(studentB.user.id, assessment.id, {});
        trackAttempt(registry, attemptB.id);
        await answerBothQuestions(
          studentB.user.id,
          attemptB.id,
          q1.currentVersion!.id,
          q1Correct,
          true,
          q2.currentVersion!.id,
          q2Correct,
          false,
          q1Wrong,
          q2Wrong,
        );
        await attemptsService.submitAttempt(studentB.user.id, attemptB.id);

        // Student C: both wrong -> 0/10 = 0%
        const attemptC = await attemptsService.startAttempt(studentC.user.id, assessment.id, {});
        trackAttempt(registry, attemptC.id);
        await answerBothQuestions(
          studentC.user.id,
          attemptC.id,
          q1.currentVersion!.id,
          q1Correct,
          false,
          q2.currentVersion!.id,
          q2Correct,
          false,
          q1Wrong,
          q2Wrong,
        );
        await attemptsService.submitAttempt(studentC.user.id, attemptC.id);
      });
      // 120s, not the 60s default (helpers.ts's own comment) — this
      // fixture's real notifyAssessmentPublished/notifyAttemptFinalized
      // calls hit the same pre-existing Resend sandbox restriction visible
      // across this whole suite (test recipients aren't the verified
      // sender address), and retry with backoff before the circuit
      // breaker opens. A file with two full multi-student setups needs
      // more headroom than any single existing test did.
    }, 120_000);

    afterAll(async () => {
      await cleanupRegistry(registry);
    });

    it('ranks students by average score percentage, descending', async () => {
      const leaderboard = await reportsService.getLeaderboard(studentAUserId);
      expect(leaderboard.entries).toHaveLength(3);

      const [first, second, third] = leaderboard.entries;
      expect(first.studentId).toBe(studentAProfileId);
      expect(first.averageScorePercent).toBe(100);
      expect(second.studentId).toBe(studentBProfileId);
      expect(second.averageScorePercent).toBe(50);
      expect(third.studentId).toBe(studentCProfileId);
      expect(third.averageScorePercent).toBe(0);

      expect(first.rank).toBe(1);
      expect(second.rank).toBe(2);
      expect(third.rank).toBe(3);
    });

    it('assigns tiers by cumulative percentile within the batch (n=3, no ties)', async () => {
      const leaderboard = await reportsService.getLeaderboard(studentAUserId);
      const [first, second, third] = leaderboard.entries;

      // n=3, three distinct scores (100/50/0): platinumCutoffRank=ceil(0.3)=1
      // (threshold=100), goldCutoffRank=ceil(1.05)=2 (threshold=50),
      // silverCutoffRank=ceil(2.1)=3 (threshold=0) — score-based thresholds
      // and rank-based cutoffs coincide exactly when nobody ties, since each
      // cutoff rank's score belongs to exactly one student.
      expect(first.tier).toBe('platinum');
      expect(second.tier).toBe('gold');
      expect(third.tier).toBe('silver');
    });

    it('marks isSelf against the CALLER only, not a fixed row', async () => {
      const asA = await reportsService.getLeaderboard(studentAUserId);
      expect(asA.entries.find((e) => e.studentId === studentAProfileId)?.isSelf).toBe(true);
      expect(asA.entries.filter((e) => e.isSelf)).toHaveLength(1);

      const asC = await reportsService.getLeaderboard(studentCUserId);
      expect(asC.entries.find((e) => e.studentId === studentCProfileId)?.isSelf).toBe(true);
      expect(asC.entries.filter((e) => e.isSelf)).toHaveLength(1);
      // Same batch, same ranking, different isSelf — not two independent
      // queries that happen to agree.
      expect(asC.entries.map((e) => e.studentId)).toEqual(asA.entries.map((e) => e.studentId));
    });

    it('exposes only rank/studentId/displayName/averageScorePercent/tier/isSelf', async () => {
      const leaderboard = await reportsService.getLeaderboard(studentAUserId);
      for (const entry of leaderboard.entries) {
        expect(Object.keys(entry).sort()).toEqual(
          ['averageScorePercent', 'displayName', 'isSelf', 'rank', 'studentId', 'tier'].sort(),
        );
      }
    });
  });

  // Regression coverage for the real edge case a live test surfaced: two
  // students tied at the exact same average score % used to land in
  // different tiers under a purely rank-based scheme (rank 1 -> a better
  // tier than rank 2, even though performance was identical). Tiers are
  // now assigned by SCORE (reports.service.ts's tierThresholds/
  // tierForScore) specifically so this can't happen — this batch mirrors
  // the exact n=2/tied-at-50% shape the live test hit.
  describe('tied scores share the same tier (n=2, both at 50%)', () => {
    const registry: FixtureRegistry = createRegistry();
    let studentAUserId: string;
    let studentAProfileId: string;
    let studentBUserId: string;
    let studentBProfileId: string;

    beforeAll(async () => {
      await setupWithCleanup(registry, async () => {
        const staff = await makeUser(registry, 'leaderboard-tie-staff');
        const college = await makeCollege(registry, staff.id);
        const department = await makeDepartment(registry, college.id, staff.id);
        const program = await makeTrainingProgram(registry, college.id, department.id, staff.id);
        const batch = await makeBatch(registry, program.id, staff.id);
        const session = await makeTrainingSession(registry, program.id, staff.id);

        const studentA = await makeStudent(registry, college.id, staff.id);
        const studentB = await makeStudent(registry, college.id, staff.id);
        studentAUserId = studentA.user.id;
        studentAProfileId = studentA.profile.id;
        studentBUserId = studentB.user.id;
        studentBProfileId = studentB.profile.id;
        await enrollStudentInBatch(registry, program.id, studentA.profile.id, batch.id, staff.id);
        await enrollStudentInBatch(registry, program.id, studentB.profile.id, batch.id, staff.id);

        const q1 = await makeApprovedQuestion(
          registry,
          {
            type: 'mcq',
            difficulty: 'easy',
            questionText: 'Tie test Q1: 2 + 2?',
            marks: 5,
            options: [
              { optionText: '3', isCorrect: false, sortOrder: 0 },
              { optionText: '4', isCorrect: true, sortOrder: 1 },
            ],
          },
          staff.id,
        );
        const q2 = await makeApprovedQuestion(
          registry,
          {
            type: 'mcq',
            difficulty: 'easy',
            questionText: 'Tie test Q2: 3 + 3?',
            marks: 5,
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
            title: 'Leaderboard tie test assessment',
            testCategory: 'mcq',
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
          questionVersionId: q1.currentVersion!.id,
        });
        await assessmentsService.createAssessmentQuestion(assessment.id, section.id, {
          questionVersionId: q2.currentVersion!.id,
        });
        await publishDraftAssessment(assessment.id, staff.id);

        const q1Correct = q1.currentVersion!.options.find((o) => o.isCorrect)!.id;
        const q1Wrong = q1.currentVersion!.options.find((o) => !o.isCorrect)!.id;
        const q2Correct = q2.currentVersion!.options.find((o) => o.isCorrect)!.id;
        const q2Wrong = q2.currentVersion!.options.find((o) => !o.isCorrect)!.id;

        // Both students: exactly one of two correct -> 5/10 = 50% each,
        // by different questions, so it's a genuine tie, not two students
        // who happened to submit identical answers.
        const attemptA = await attemptsService.startAttempt(studentA.user.id, assessment.id, {});
        trackAttempt(registry, attemptA.id);
        await answerBothQuestions(
          studentA.user.id,
          attemptA.id,
          q1.currentVersion!.id,
          q1Correct,
          true,
          q2.currentVersion!.id,
          q2Correct,
          false,
          q1Wrong,
          q2Wrong,
        );
        await attemptsService.submitAttempt(studentA.user.id, attemptA.id);

        const attemptB = await attemptsService.startAttempt(studentB.user.id, assessment.id, {});
        trackAttempt(registry, attemptB.id);
        await answerBothQuestions(
          studentB.user.id,
          attemptB.id,
          q1.currentVersion!.id,
          q1Correct,
          false,
          q2.currentVersion!.id,
          q2Correct,
          true,
          q1Wrong,
          q2Wrong,
        );
        await attemptsService.submitAttempt(studentB.user.id, attemptB.id);
      });
      // 120s, not the 60s default (helpers.ts's own comment) — this
      // fixture's real notifyAssessmentPublished/notifyAttemptFinalized
      // calls hit the same pre-existing Resend sandbox restriction visible
      // across this whole suite (test recipients aren't the verified
      // sender address), and retry with backoff before the circuit
      // breaker opens. A file with two full multi-student setups needs
      // more headroom than any single existing test did.
    }, 120_000);

    afterAll(async () => {
      await cleanupRegistry(registry);
    });

    it('gives both tied students the SAME (better) tier, despite different ranks', async () => {
      const leaderboard = await reportsService.getLeaderboard(studentAUserId);
      expect(leaderboard.entries).toHaveLength(2);

      const [first, second] = leaderboard.entries;
      expect(first.averageScorePercent).toBe(50);
      expect(second.averageScorePercent).toBe(50);
      // Ranks still differ (a strict 1..n ordering, alphabetical tie-break)...
      expect(first.rank).toBe(1);
      expect(second.rank).toBe(2);
      // ...but tier does NOT: n=2, platinumCutoffRank=ceil(0.2)=1, and both
      // students share that rank's score (50), so both get platinum.
      expect(first.tier).toBe('platinum');
      expect(second.tier).toBe('platinum');

      const studentIds = [studentAProfileId, studentBProfileId];
      expect(studentIds).toContain(first.studentId);
      expect(studentIds).toContain(second.studentId);
    });
  });

  describe('empty states', () => {
    const registry: FixtureRegistry = createRegistry();
    let noAttemptsStudentUserId: string;

    beforeAll(async () => {
      await setupWithCleanup(registry, async () => {
        const staff = await makeUser(registry, 'leaderboard-empty-staff');
        const college = await makeCollege(registry, staff.id);
        const department = await makeDepartment(registry, college.id, staff.id);
        const program = await makeTrainingProgram(registry, college.id, department.id, staff.id);
        const batch = await makeBatch(registry, program.id, staff.id);

        const student = await makeStudent(registry, college.id, staff.id);
        noAttemptsStudentUserId = student.user.id;
        await enrollStudentInBatch(registry, program.id, student.profile.id, batch.id, staff.id);
      });
    });

    afterAll(async () => {
      await cleanupRegistry(registry);
    });

    it('returns an empty entries array when nobody in the batch has a completed attempt', async () => {
      const leaderboard = await reportsService.getLeaderboard(noAttemptsStudentUserId);
      expect(leaderboard.entries).toEqual([]);
    });
  });
});
