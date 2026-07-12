import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { inArray } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { users } from '../../src/db/schema/identity.schema';
import { colleges, departments, trainingPrograms, batches } from '../../src/db/schema/organization.schema';
import { trainingSessions } from '../../src/db/schema/trainers.schema';
import { studentProfiles, trainingProgramStudents } from '../../src/db/schema/students.schema';
import { assessments } from '../../src/db/schema/assessments.schema';
import {
  questionCategories,
  questionTopics,
  questionTags,
  questions,
  questionPools,
} from '../../src/db/schema/question-bank.schema';
import {
  assessmentAttempts,
  attemptQuestionSelections,
  attemptResponses,
  proctoringEvents,
  assessmentRetakeRequests,
} from '../../src/db/schema/attempts.schema';
import { codingSubmissions } from '../../src/db/schema/coding.schema';
import { organizationService } from '../../src/modules/organization/organization.service';
import { studentsService } from '../../src/modules/students/students.service';
import { questionBankService } from '../../src/modules/question-bank/question-bank.service';
import { assessmentsService } from '../../src/modules/assessments/assessments.service';
import type { CreateQuestionInput } from '../../src/modules/question-bank/question-bank.schema';
import type { CreateAssessmentInput } from '../../src/modules/assessments/assessments.schema';

// Every builder below pushes the ids it creates into this registry, and
// cleanupRegistry (bottom of this file) deletes them all in the one FK-safe
// order that works for every combination these test files use — reverse of
// the dependency chain (leaf tables first), confirmed against every
// relevant db/schema/*.schema.ts onDelete rule directly rather than assumed.
// Most FKs used here are 'restrict' (not 'cascade'), so getting this order
// wrong throws a real Postgres FK violation rather than silently leaving
// orphans — which is exactly why this is centralized in one place instead
// of being re-derived per test file.
export interface FixtureRegistry {
  userIds: Set<string>;
  collegeIds: Set<string>;
  departmentIds: Set<string>;
  trainingProgramIds: Set<string>;
  batchIds: Set<string>;
  trainingSessionIds: Set<string>;
  studentProfileIds: Set<string>;
  trainingProgramStudentIds: Set<string>;
  questionIds: Set<string>;
  questionPoolIds: Set<string>;
  questionCategoryIds: Set<string>;
  questionTopicIds: Set<string>;
  questionTagIds: Set<string>;
  assessmentIds: Set<string>;
  assessmentAttemptIds: Set<string>;
}

export function createRegistry(): FixtureRegistry {
  return {
    userIds: new Set(),
    collegeIds: new Set(),
    departmentIds: new Set(),
    trainingProgramIds: new Set(),
    batchIds: new Set(),
    trainingSessionIds: new Set(),
    studentProfileIds: new Set(),
    trainingProgramStudentIds: new Set(),
    questionIds: new Set(),
    questionPoolIds: new Set(),
    questionCategoryIds: new Set(),
    questionTopicIds: new Set(),
    questionTagIds: new Set(),
    assessmentIds: new Set(),
    assessmentAttemptIds: new Set(),
  };
}

// Direct db.insert — see this project's earlier research: no
// createUser/signup exists anywhere in src (users.service.ts,
// users.repository.ts, auth.service.ts all confirmed to have no create
// path). passwordHash uses argon2 directly, the same library
// auth.service.ts's login verifies against via argon2.verify.
export async function makeUser(registry: FixtureRegistry, label: string) {
  const passwordHash = await argon2.hash('Test-Password-1234!');
  const [user] = await db
    .insert(users)
    .values({
      email: `test-${label}-${randomUUID()}@jcs-ilearn.test`,
      passwordHash,
      fullName: `Test ${label}`,
    })
    .returning();
  registry.userIds.add(user.id);
  return user;
}

export async function makeCollege(registry: FixtureRegistry, createdBy: string) {
  const suffix = randomUUID().slice(0, 8);
  const college = await organizationService.createCollege(
    { name: `Test College ${suffix}`, code: `TC-${suffix}` },
    createdBy,
  );
  registry.collegeIds.add(college.id);
  return college;
}

export async function makeDepartment(registry: FixtureRegistry, collegeId: string, createdBy: string) {
  const department = await organizationService.createDepartment(
    { collegeId, name: `Test Department ${randomUUID().slice(0, 8)}` },
    createdBy,
  );
  registry.departmentIds.add(department.id);
  return department;
}

export async function makeTrainingProgram(
  registry: FixtureRegistry,
  collegeId: string,
  departmentId: string,
  createdBy: string,
) {
  const program = await organizationService.createTrainingProgram(
    { collegeId, departmentId, name: `Test Program ${randomUUID().slice(0, 8)}` },
    createdBy,
  );
  registry.trainingProgramIds.add(program.id);
  return program;
}

export async function makeBatch(registry: FixtureRegistry, trainingProgramId: string, createdBy: string) {
  const batch = await organizationService.createBatch(
    { trainingProgramId, name: `Test Batch ${randomUUID().slice(0, 8)}` },
    createdBy,
  );
  registry.batchIds.add(batch.id);
  return batch;
}

// training_sessions has no service/repository create function anywhere in
// this codebase (confirmed by direct read of trainers.service.ts and its
// own schema-file comment) — direct insert is the only option.
export async function makeTrainingSession(
  registry: FixtureRegistry,
  trainingProgramId: string,
  createdBy: string,
) {
  const [session] = await db
    .insert(trainingSessions)
    .values({
      trainingProgramId,
      title: `Test Session ${randomUUID().slice(0, 8)}`,
      sessionNumber: 1,
      sessionDate: new Date().toISOString().slice(0, 10),
      createdBy,
    })
    .returning();
  registry.trainingSessionIds.add(session.id);
  return session;
}

export async function makeStudent(registry: FixtureRegistry, collegeId: string, createdBy: string) {
  const user = await makeUser(registry, 'student');
  const profile = await studentsService.createStudentProfile({ userId: user.id, collegeId }, createdBy);
  registry.studentProfileIds.add(profile.id);
  return { user, profile };
}

// training_program_students has no service/repository create function
// anywhere either (same confirmed gap, students.schema.ts's own comment) —
// direct insert, status defaults to 'active' which is exactly what
// startAttempt's assertBatchAuthorized requires (studentsService.
// listActiveBatchIdsForStudent filters on status = 'active').
export async function enrollStudentInBatch(
  registry: FixtureRegistry,
  trainingProgramId: string,
  studentProfileId: string,
  batchId: string,
  createdBy: string,
) {
  const [row] = await db
    .insert(trainingProgramStudents)
    .values({ trainingProgramId, studentId: studentProfileId, batchId, createdBy })
    .returning();
  registry.trainingProgramStudentIds.add(row.id);
  return row;
}

// Full draft->approved question chain — createAssessmentQuestion (and pool
// resolution) both require status = 'approved', so every question fixture
// needs this 3-call chain, not just createQuestion alone.
export async function makeApprovedQuestion(
  registry: FixtureRegistry,
  input: CreateQuestionInput,
  actorId: string,
) {
  const question = await questionBankService.createQuestion(input, actorId);
  registry.questionIds.add(question.id);
  await questionBankService.submitQuestionForApproval(question.id, actorId, {});
  await questionBankService.approveQuestion(question.id, actorId, {});
  return question;
}

export async function makeQuestionCategory(registry: FixtureRegistry) {
  const category = await questionBankService.createQuestionCategory({
    name: `Test Category ${randomUUID().slice(0, 8)}`,
  });
  registry.questionCategoryIds.add(category.id);
  return category;
}

export async function makeQuestionTopic(registry: FixtureRegistry) {
  const topic = await questionBankService.createQuestionTopic({
    name: `Test Topic ${randomUUID().slice(0, 8)}`,
  });
  registry.questionTopicIds.add(topic.id);
  return topic;
}

export async function makeQuestionTag(registry: FixtureRegistry) {
  const tag = await questionBankService.createQuestionTag({ name: `test-tag-${randomUUID()}` });
  registry.questionTagIds.add(tag.id);
  return tag;
}

// Only creates the assessment (status 'draft') and tracks it — sections/
// questions must still be added by the caller BEFORE calling
// publishDraftAssessment below, since createAssessmentSection/
// createAssessmentQuestion both require status === 'draft'
// (assertAssessmentEditable) and submitAssessment moves it past that.
export async function createDraftAssessment(
  registry: FixtureRegistry,
  input: CreateAssessmentInput,
  actorId: string,
) {
  const assessment = await assessmentsService.createAssessment(input, actorId);
  registry.assessmentIds.add(assessment.id);
  return assessment;
}

// draft -> review -> approved -> scheduled -> live. startAttempt requires
// status === 'live' specifically (see attempts.service.ts's
// assertAssessmentAttemptable) — this is the only way to reach it.
export async function publishDraftAssessment(assessmentId: string, actorId: string) {
  await assessmentsService.submitAssessment(assessmentId, actorId, {});
  await assessmentsService.approveAssessment(assessmentId, actorId, {});
  await assessmentsService.scheduleAssessment(assessmentId, actorId, {
    startAt: new Date(Date.now() - 60_000),
    endAt: new Date(Date.now() + 60 * 60_000),
  });
  return assessmentsService.publishAssessment(assessmentId, actorId, {});
}

export function trackAttempt(registry: FixtureRegistry, attemptId: string): void {
  registry.assessmentAttemptIds.add(attemptId);
}

// Hardening for beforeAll fixture setup (see this project's own incident:
// an orphaned-rows report traced back to a beforeAll that hit the old 20s
// hookTimeout partway through building its fixture chain). Every make*
// helper above already pushes its id into the registry immediately, before
// returning — so the registry is ALWAYS incrementally accurate up to
// whatever step actually completed, never only "all at the end." The gap
// this closes is different: without this wrapper, a THROWN error partway
// through `build` (a real ConflictError/ValidationError from a service
// call, a transient network failure, etc.) propagates straight out of
// beforeAll, and cleanup only happens later via afterAll's cleanupRegistry
// call — which DOES still run (confirmed empirically: Vitest runs afterAll
// even when beforeAll throws or times out), but as a SEPARATE hook
// invocation racing against whatever's still in flight from the failed
// beforeAll's own promise chain if it doesn't actually stop running
// (finished awaits keep resolving even after Vitest gives up and moves on
// — JS has no way to cancel an in-flight promise). Wrapping build() in a
// try/catch INSIDE beforeAll itself and calling cleanupRegistry
// synchronously in the SAME async chain, before the error is ever allowed
// to leave this function, removes that race entirely for the "thrown
// error" case: cleanup runs to completion as a direct continuation of the
// exact code that did the creating, not as an independent hook Vitest
// schedules afterward.
//
// This does NOT fully close the "genuine hook timeout" case (a hung
// network call that never resolves, never rejects) — Vitest's timeout
// mechanism doesn't inject a cancellation into the hook function, so a
// try/catch inside it can't run until/unless that hung promise itself
// eventually settles. That residual gap is mitigated instead by
// vitest.config.ts's now-60s hookTimeout (generous enough that a real hang,
// not just normal Supabase latency, is what would trigger it) plus
// afterAll's cleanupRegistry call remaining the backstop for that rarer
// case. The error is always re-thrown after cleanup so Vitest still
// reports the real failure — this wrapper only guarantees rows don't leak,
// it never silently swallows a fixture-setup failure.
export async function setupWithCleanup(
  registry: FixtureRegistry,
  build: () => Promise<void>,
): Promise<void> {
  try {
    await build();
  } catch (setupError) {
    try {
      await cleanupRegistry(registry);
    } catch (cleanupError) {
      throw new Error(
        `Fixture setup failed AND cleanup-on-failure also failed — rows may be orphaned.\n` +
          `Setup error: ${setupError instanceof Error ? setupError.stack : String(setupError)}\n` +
          `Cleanup error: ${cleanupError instanceof Error ? cleanupError.stack : String(cleanupError)}`,
      );
    }
    throw setupError;
  }
}

// Deletes everything this registry tracked, in the one order that respects
// every 'restrict' FK involved (see this file's module comment). Every step
// is guarded by an emptiness check so a registry that never touched a given
// table is a no-op for it, not an error.
export async function cleanupRegistry(registry: FixtureRegistry): Promise<void> {
  const attemptIds = [...registry.assessmentAttemptIds];
  if (attemptIds.length > 0) {
    await db.delete(proctoringEvents).where(inArray(proctoringEvents.attemptId, attemptIds));

    const responseRows = await db
      .select({ id: attemptResponses.id })
      .from(attemptResponses)
      .where(inArray(attemptResponses.attemptId, attemptIds));
    const responseIds = responseRows.map((row) => row.id);
    if (responseIds.length > 0) {
      await db.delete(codingSubmissions).where(inArray(codingSubmissions.attemptResponseId, responseIds));
    }

    await db.delete(attemptResponses).where(inArray(attemptResponses.attemptId, attemptIds));
    await db.delete(attemptQuestionSelections).where(inArray(attemptQuestionSelections.attemptId, attemptIds));
    await db.delete(assessmentRetakeRequests).where(inArray(assessmentRetakeRequests.attemptId, attemptIds));
    await db.delete(assessmentAttempts).where(inArray(assessmentAttempts.id, attemptIds));
  }

  const assessmentIds = [...registry.assessmentIds];
  if (assessmentIds.length > 0) {
    // Cascades assessment_sections, assessment_questions,
    // assessment_section_pools, assessment_batches, assessment_approval_history.
    await db.delete(assessments).where(inArray(assessments.id, assessmentIds));
  }

  const questionPoolIds = [...registry.questionPoolIds];
  if (questionPoolIds.length > 0) {
    // Cascades question_pool_criteria.
    await db.delete(questionPools).where(inArray(questionPools.id, questionPoolIds));
  }

  const questionIds = [...registry.questionIds];
  if (questionIds.length > 0) {
    // Cascades question_versions, question_options, question_images,
    // question_topic_map, question_tag_map, and every type-specific
    // detail table keyed off question_version_id.
    await db.delete(questions).where(inArray(questions.id, questionIds));
  }

  const tagIds = [...registry.questionTagIds];
  if (tagIds.length > 0) {
    await db.delete(questionTags).where(inArray(questionTags.id, tagIds));
  }
  const topicIds = [...registry.questionTopicIds];
  if (topicIds.length > 0) {
    await db.delete(questionTopics).where(inArray(questionTopics.id, topicIds));
  }
  const categoryIds = [...registry.questionCategoryIds];
  if (categoryIds.length > 0) {
    await db.delete(questionCategories).where(inArray(questionCategories.id, categoryIds));
  }

  const tpsIds = [...registry.trainingProgramStudentIds];
  if (tpsIds.length > 0) {
    await db.delete(trainingProgramStudents).where(inArray(trainingProgramStudents.id, tpsIds));
  }

  const sessionIds = [...registry.trainingSessionIds];
  if (sessionIds.length > 0) {
    await db.delete(trainingSessions).where(inArray(trainingSessions.id, sessionIds));
  }

  const batchIds = [...registry.batchIds];
  if (batchIds.length > 0) {
    await db.delete(batches).where(inArray(batches.id, batchIds));
  }

  const studentProfileIds = [...registry.studentProfileIds];
  if (studentProfileIds.length > 0) {
    await db.delete(studentProfiles).where(inArray(studentProfiles.id, studentProfileIds));
  }

  const programIds = [...registry.trainingProgramIds];
  if (programIds.length > 0) {
    await db.delete(trainingPrograms).where(inArray(trainingPrograms.id, programIds));
  }

  const departmentIds = [...registry.departmentIds];
  if (departmentIds.length > 0) {
    await db.delete(departments).where(inArray(departments.id, departmentIds));
  }

  const collegeIds = [...registry.collegeIds];
  if (collegeIds.length > 0) {
    await db.delete(colleges).where(inArray(colleges.id, collegeIds));
  }

  const userIds = [...registry.userIds];
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
  }
}
