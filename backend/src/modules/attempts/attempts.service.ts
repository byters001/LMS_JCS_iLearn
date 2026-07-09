import type { StudentProfile } from '../../db/types';
import { assessmentsService } from '../assessments/assessments.service';
import { questionBankService } from '../question-bank/question-bank.service';
import { studentsService } from '../students/students.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { attemptsRepository, type SelectionInput } from './attempts.repository';
import type { SubmitResponseInput } from './attempts.schema';
import type {
  AssessmentAttempt,
  AttemptQuestionContent,
  AttemptResponse,
  FrozenAttemptQuestion,
} from './attempts.types';

// --- Permission model (item 6) ---
//
// schema.sql seeds exactly one permissions row for this module:
// 'attempts.reassign' ("Reassign/retake an attempt"), granted only to
// Faculty — and the 'student' role gets ZERO role_permissions grants at
// all (checked schema.sql's INSERT INTO role_permissions directly: only
// super_admin and faculty rows exist). There is no precedent anywhere in
// this codebase for a permission key ever being granted to a student.
//
// This is the first module where the primary actor IS a student, and a
// student calling these routes will never hold ANY permission key — so
// gating start/take/submit behind requirePermission(<anything>) would lock
// every student out unconditionally. Inventing a new key (e.g.
// 'attempts.take') and then also seeding a role_permissions grant for
// 'student' would be the only way to make requirePermission() work here,
// but that's a bigger, live-DB-affecting seed change than "add a
// permission key," and there's no precedent for granting students
// permission keys to justify it.
//
// The self-vs-admin pattern the task asked me to check (users.controller.ts's
// assertCanManageAvatar) turns out NOT to be a clean precedent to copy
// either: that route's baseline gate is still requirePermission('users.edit')
// at the ROUTE level, with self-ownership only as a bypass INSIDE that
// already-permission-gated controller — a permission-less caller (like a
// student) is rejected by the route's preHandler before the self-ownership
// check ever runs. Copying that shape verbatim would reproduce the same
// gap for students that avatar upload already quietly has for them.
//
// Decision: every route below is gated by fastify.authenticate ONLY (valid
// JWT, no permission key at all) at the route level. Authorization is then
// entirely self-ownership, enforced here in the service:
//   1. requireStudentProfile() resolves the caller's JWT user id to a
//      student_profiles row via studentsService.findStudentProfileByUserId
//      (added to students.service.ts this phase). A caller with no
//      student_profiles row (any staff account) is rejected here — this
//      structurally IS the permission gate for this module: only users who
//      are students at all can reach any of these operations, enforced by
//      data (does a student_profiles row exist for this user_id?) rather
//      than by an RBAC permission key.
//   2. assertOwnsAttempt() then confirms the resolved student_profiles.id
//      matches the specific attempt's student_id, for every operation on
//      an already-existing attempt.
// attempts.reassign is left untouched by this phase — its own seeded
// description ("Reassign/retake an attempt") maps directly onto Part 2's
// assessment_retake_requests workflow, not onto the normal lifecycle built
// here.
//
// Also deliberately NOT built in this phase: any staff-facing "list/view
// all attempts for an assessment" oversight endpoint. Nothing in items 1-6
// asked for one, and it overlaps with reports/analytics' cross-cutting
// aggregation role per CLAUDE.md. Every read here is self-scoped only.

async function requireStudentProfile(userId: string): Promise<StudentProfile> {
  const studentProfile = await studentsService.findStudentProfileByUserId(userId);
  if (!studentProfile) {
    throw new ForbiddenError('Only students may attempt assessments');
  }
  return studentProfile;
}

function assertOwnsAttempt(attempt: AssessmentAttempt, studentProfileId: string): void {
  if (attempt.studentId !== studentProfileId) {
    throw new ForbiddenError('You can only access your own attempts');
  }
}

async function findAttemptOr404(attemptId: string): Promise<AssessmentAttempt> {
  const attempt = await attemptsRepository.findAttemptById(attemptId);
  if (!attempt) {
    throw new NotFoundError('Attempt not found');
  }
  return attempt;
}

// --- Start (or resume) an attempt ---
//
// Status gate (item 3): gated on assessment.status === 'live' specifically,
// not 'scheduled' or 'approved'. Per assessments.service.ts's own state
// machine comment, the workflow is
//   draft -> review -> approved -> scheduled -> live -> completed -> archived
// 'scheduled' only means startAt/endAt have been committed to
// (scheduleAssessment's own validation requires both to be set) — it is
// NOT the same as being open to students. Only the dedicated `publish`
// action moves status to 'live', which is the actual "this is now
// attemptable" signal this codebase already models. Nothing in this phase
// additionally re-checks assessment.startAt/endAt against the current time
// on top of the status gate — schema.sql's own jobs/ folder (scheduler)
// is the natural home for time-driven status transitions in a later phase;
// this module trusts assessment.status as the single source of truth for
// "is this open right now," same as every other status-gated action in
// this codebase (e.g. assertAssessmentEditable trusting status='draft'
// alone, no extra time-based re-check).
async function assertAssessmentAttemptable(
  status: 'draft' | 'review' | 'approved' | 'scheduled' | 'live' | 'completed' | 'archived',
): Promise<void> {
  if (status !== 'live') {
    throw new ConflictError(
      `Cannot start an attempt — this assessment's status is "${status}", must be "live"`,
    );
  }
}

export interface StartAttemptMeta {
  ipAddress?: string;
  browserInfo?: string;
}

// --- Batch authorization (Part 1 fix #1) ---
//
// assessment_batches ("who can take this assessment," per
// assessments.service.ts's own module comment) was never checked in the
// first pass of this module — a real gap. Confirmed the FK path directly
// against schema.sql rather than assuming it: student_profiles has NO
// batch_id/college_id-derived batch column of its own. Batch membership
// only exists via training_program_students (student_id -> student_profiles.id,
// batch_id -> batches.id, plus a status column — tps_status_enum: active,
// transferred, repeated, completed, dropped). This is the SAME join
// students.repository.ts's own listStudentProfiles batchId filter already
// uses, not a new/guessed path.
//
// A student is authorized for this assessment if ANY of their batch ids
// (from training_program_students rows with status = 'active' — see
// students.repository.ts's listActiveBatchIdsForStudent for why the other
// four statuses are excluded) appears in assessment_batches for this
// assessment (via assessmentsService.listAssessmentBatches, already
// exported — reused directly, not re-queried here).
//
// This check runs unconditionally on every startAttempt call, including
// resume calls (i.e. it also re-runs for a student with an already-open
// attempt) — a straightforward reading of "startAttempt must check
// assessment_batches." One consequence worth flagging explicitly: if a
// student's batch assignment is changed/revoked while they have an
// in-progress attempt, their next "resume" call would now be rejected too,
// not just a genuinely new attempt. If you'd rather this only gate
// brand-new attempts (exempting resume of an already-open one), say so and
// I'll move this check after the existingOpenAttempt short-circuit below.
async function assertBatchAuthorized(assessmentId: string, studentProfileId: string): Promise<void> {
  const [assessmentBatchIds, studentBatchIds] = await Promise.all([
    assessmentsService.listAssessmentBatches(assessmentId),
    studentsService.listActiveBatchIdsForStudent(studentProfileId),
  ]);

  const isAuthorized = assessmentBatchIds.some((batchId) => studentBatchIds.includes(batchId));
  if (!isAuthorized) {
    throw new ForbiddenError('You are not authorized to attempt this assessment');
  }
}

// The "freeze exactly once" operation (item 2). Design:
//
// 1. If this student already has an OPEN attempt (status 'not_started' or
//    'in_progress') for this assessment, RETURN IT — no new row, no
//    re-resolution. This is what makes "start" safe to call again after a
//    page refresh/reconnect: without this check, every retry would burn
//    another attempt_number and freeze a second, independent set of
//    questions, which is not what "resume" should do and would make
//    max_attempts effectively mean something different from what a
//    student/instructor would expect it to mean.
// 2. Otherwise, count every existing attempt (any status, including
//    'invalidated' — see attempts.repository.ts's countAttemptsForStudent)
//    against assessment.maxAttempts; exceeding it throws before anything
//    is written.
// 3. Every section's questions are resolved by calling
//    assessmentsService.resolveSectionQuestions per section — the EXACT
//    same function GET /assessments/:id/sections/:sectionId/resolve calls,
//    reused directly rather than re-deriving manual-join/pool-random-draw
//    logic here. This is a read-only, cross-module SERVICE call (per
//    CLAUDE.md's boundary rule) and happens BEFORE the write transaction
//    opens, because it can't participate in that transaction (it doesn't
//    accept a `tx` handle) and doesn't need to — it mutates nothing.
// 4. attemptsRepository.createAttemptWithSelections then writes the
//    assessment_attempts row AND every attempt_question_selections row (for
//    every section, flattened) inside ONE db.transaction. This is where
//    "freeze exactly once" is actually enforced: either the attempt row and
//    the complete set of selections all commit together, or (on any error)
//    none of them do — there is no code path that leaves an in_progress
//    attempt with a partial or empty frozen selection set alongside content
//    that failed to insert.
//
// After this call, attempt_question_selections is the ONLY source of truth
// for "this attempt's questions" — see getAttemptQuestions below, which
// never calls resolveSectionQuestions again.
async function startAttempt(
  userId: string,
  assessmentId: string,
  meta: StartAttemptMeta,
): Promise<AssessmentAttempt> {
  const studentProfile = await requireStudentProfile(userId);
  const assessment = await assessmentsService.findAssessmentById(assessmentId);
  await assertAssessmentAttemptable(assessment.status);
  await assertBatchAuthorized(assessmentId, studentProfile.id);

  const existingOpenAttempt = await attemptsRepository.findOpenAttempt(
    assessmentId,
    studentProfile.id,
  );
  if (existingOpenAttempt) {
    return existingOpenAttempt;
  }

  const attemptsSoFar = await attemptsRepository.countAttemptsForStudent(
    assessmentId,
    studentProfile.id,
  );
  if (attemptsSoFar >= assessment.maxAttempts) {
    throw new ConflictError(
      `Maximum attempts (${assessment.maxAttempts}) already used for this assessment`,
    );
  }

  const sections = await assessmentsService.listAssessmentSections(assessmentId);
  const resolvedSections = await Promise.all(
    sections.map((section) => assessmentsService.resolveSectionQuestions(assessmentId, section.id)),
  );

  const selections: SelectionInput[] = resolvedSections.flatMap((resolved) =>
    resolved.questions.map((question) => ({
      assessmentSectionId: resolved.section.id,
      questionVersionId: question.questionVersionId,
      sortOrder: question.sortOrder,
    })),
  );

  const attemptNumber = attemptsSoFar + 1;
  return attemptsRepository.createAttemptWithSelections(
    {
      assessmentId,
      studentId: studentProfile.id,
      attemptNumber,
      isRetake: attemptNumber > 1,
      ipAddress: meta.ipAddress,
      browserInfo: meta.browserInfo,
    },
    selections,
  );
}

async function getAttemptById(userId: string, attemptId: string): Promise<AssessmentAttempt> {
  const attempt = await findAttemptOr404(attemptId);
  const studentProfile = await requireStudentProfile(userId);
  assertOwnsAttempt(attempt, studentProfile.id);
  return attempt;
}

// Self-scoped only (item 6's decision) — see this file's module comment.
async function listMyAttempts(
  userId: string,
  assessmentId?: string,
): Promise<AssessmentAttempt[]> {
  const studentProfile = await requireStudentProfile(userId);
  return attemptsRepository.listAttemptsForStudent(studentProfile.id, assessmentId);
}

// Reads attempt_question_selections ONLY — see attempts.repository.ts's
// listFrozenQuestions. This function never calls
// assessmentsService.resolveSectionQuestions; that path is exclusively
// startAttempt's, and only runs once, before this attempt's rows exist.
//
// Part 1 fix #2: each frozen selection is now enriched with renderable,
// test-taker-safe content, by REUSING question-bank's existing content
// functions (findQuestionVersionContentById + findQuestionById — the same
// two-call pattern submitResponse below already uses) rather than this
// module querying question_options/psychometric_options/
// coding_question_details/coding_test_cases directly. See
// buildRenderableQuestion for exactly what's stripped per type.
async function getAttemptQuestions(
  userId: string,
  attemptId: string,
): Promise<AttemptQuestionContent[]> {
  const attempt = await findAttemptOr404(attemptId);
  const studentProfile = await requireStudentProfile(userId);
  assertOwnsAttempt(attempt, studentProfile.id);

  const frozenQuestions = await attemptsRepository.listFrozenQuestions(attemptId);
  return Promise.all(frozenQuestions.map((frozen) => buildRenderableQuestion(frozen)));
}

// Sanitization per question type — confirmed each table's actual columns
// against schema.sql before deciding what to strip, not assumed:
//   - mcq: question_options has is_correct — stripped. optionText/imageUrl/
//     sortOrder are exposed.
//   - psychometric: psychometric_options has NO separate "correct" flag,
//     but DOES have trait_weight (numeric, the score a selected option
//     contributes to a trait) — stripped for the same reason is_correct
//     is: it would let a test-taker reverse-engineer which option
//     maximizes a given trait, defeating the point of a psychometric
//     instrument. Only optionText/sortOrder are exposed.
//   - coding: coding_question_details' columns (problem statement, input/
//     output format, constraints, limits, supported languages) are all
//     safe to expose as-is — that's literally the problem a test-taker is
//     meant to read. coding_test_cases is filtered to is_hidden = false
//     only (hidden cases are grading fixtures for the future coding
//     module, never shown), and `points` is stripped from the visible
//     ones too — same scoring-metadata category as is_correct/trait_weight.
async function buildRenderableQuestion(
  frozen: FrozenAttemptQuestion,
): Promise<AttemptQuestionContent> {
  const version = await questionBankService.findQuestionVersionContentById(
    frozen.questionVersionId,
  );
  const question = await questionBankService.findQuestionById(version.questionId);

  const enriched: AttemptQuestionContent = { ...frozen, type: question.type };

  if (question.type === 'mcq') {
    enriched.options = version.options.map((option) => ({
      id: option.id,
      optionText: option.optionText,
      imageUrl: option.imageUrl,
      sortOrder: option.sortOrder,
    }));
    return enriched;
  }

  if (question.type === 'psychometric') {
    enriched.psychometricOptions = version.psychometricOptions.map((option) => ({
      id: option.id,
      optionText: option.optionText,
      sortOrder: option.sortOrder,
    }));
    return enriched;
  }

  // 'coding' — codingDetails can be null (details not yet authored for
  // this version); leaving `coding` undefined in that case is not an
  // error, same graceful-absence treatment as every optional relation
  // elsewhere in this codebase.
  if (version.codingDetails) {
    enriched.coding = {
      problemStatement: version.codingDetails.problemStatement,
      inputFormat: version.codingDetails.inputFormat,
      outputFormat: version.codingDetails.outputFormat,
      constraints: version.codingDetails.constraints,
      timeLimitMs: version.codingDetails.timeLimitMs,
      memoryLimitKb: version.codingDetails.memoryLimitKb,
      supportedLanguages: version.codingDetails.supportedLanguages as string[],
      sampleTestCases: version.testCases
        .filter((testCase) => !testCase.isHidden)
        .map((testCase) => ({
          id: testCase.id,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          sortOrder: testCase.sortOrder,
        })),
    };
  }
  return enriched;
}

// --- Responses (item 4) ---
//
// Upsert-per-question: attempt_responses.UNIQUE(attempt_id,
// question_version_id) plus attemptsRepository.upsertResponse's ON
// CONFLICT DO UPDATE means repeated calls for the same question always
// land on the same row.
//
// Grading (item 4's explicit question): only MCQ is graded here, checking
// selectedOptionId against question_options.is_correct (fetched via
// questionBankService.findQuestionVersionContentById +
// findQuestionById — the same two-call pattern assessments.service.ts's
// createAssessmentQuestion already uses to get a version's content plus
// its parent question's type). Psychometric responses (likertValue) are
// NEVER graded — psychometric_options.trait_weight is about trait
// interpretation, not correctness, and there is no "right answer" concept
// for it at all, so is_correct/marks_obtained stay NULL by design, not by
// omission. Coding responses are also NEVER graded here — grading requires
// Judge0 execution, which belongs entirely to the future coding module;
// this endpoint still accepts a response row for a coding question (e.g.
// isMarkedForReview, timeSpentSeconds) but selectedOptionId/likertValue are
// rejected for it (see the type checks below) and is_correct/marks_obtained
// stay NULL pending that future module.
//
// Explicitly NOT applied here: negative marking. assessments/
// assessment_sections both carry negativeMarking/negativeMarkingValue
// columns, but item 4 only asked for "checking selected_option_id against
// question_options.is_correct" — a wrong MCQ answer here scores exactly
// '0', never a negative value. Flagging this as a deliberate simplification
// rather than an oversight: applying negative marking would need this
// function to also fetch the section (for its override) and the
// assessment (for its default), and decide precedence between them, which
// wasn't asked for and is easy to add as a follow-up if you want it.
//
// time_spent_seconds is overwritten (not accumulated) on every call — the
// value sent is trusted as "the current total for this question," matching
// how a frontend timer would report it, not something this backend sums
// across calls itself.
async function submitResponse(
  userId: string,
  attemptId: string,
  questionVersionId: string,
  input: SubmitResponseInput,
): Promise<AttemptResponse> {
  const attempt = await findAttemptOr404(attemptId);
  const studentProfile = await requireStudentProfile(userId);
  assertOwnsAttempt(attempt, studentProfile.id);

  if (attempt.status !== 'in_progress') {
    throw new ConflictError(
      `Cannot submit a response — this attempt's status is "${attempt.status}", must be "in_progress"`,
    );
  }

  const selection = await attemptsRepository.findSelection(attemptId, questionVersionId);
  if (!selection) {
    throw new ValidationError('This question is not part of this attempt');
  }

  // isCorrect/marksObtained are left OUT of this object (not set to null)
  // unless an MCQ answer is actually graded in this call — see the comment
  // above upsertResponse in attempts.repository.ts: an `undefined` field is
  // skipped by Drizzle (leaves the column untouched on UPDATE), whereas an
  // explicit `null` would overwrite it. A call that only updates
  // isMarkedForReview/timeSpentSeconds must NOT wipe out a previously
  // recorded grade.
  const responseData: {
    selectedOptionId?: string;
    likertValue?: number;
    isMarkedForReview?: boolean;
    timeSpentSeconds?: number;
    isCorrect?: boolean;
    marksObtained?: string;
  } = {
    selectedOptionId: input.selectedOptionId,
    likertValue: input.likertValue,
    isMarkedForReview: input.isMarkedForReview,
    timeSpentSeconds: input.timeSpentSeconds,
  };

  if (input.selectedOptionId !== undefined || input.likertValue !== undefined) {
    const version = await questionBankService.findQuestionVersionContentById(questionVersionId);
    const question = await questionBankService.findQuestionById(version.questionId);

    if (input.selectedOptionId !== undefined) {
      if (question.type !== 'mcq') {
        throw new ValidationError(
          `selectedOptionId is only valid for "mcq" questions (this question is "${question.type}")`,
        );
      }
      const option = version.options.find((candidate) => candidate.id === input.selectedOptionId);
      if (!option) {
        throw new ValidationError('selectedOptionId does not belong to this question');
      }
      responseData.isCorrect = option.isCorrect;
      responseData.marksObtained = option.isCorrect ? version.marks : '0';
    }

    if (input.likertValue !== undefined && question.type !== 'psychometric') {
      throw new ValidationError(
        `likertValue is only valid for "psychometric" questions (this question is "${question.type}")`,
      );
    }
  }

  return attemptsRepository.upsertResponse(attemptId, questionVersionId, responseData);
}

// --- Submit the whole attempt (item 5) ---
//
// total_score = SUM(attempt_responses.marks_obtained) computed entirely in
// SQL (attemptsRepository.sumResponsesForAttempt uses coalesce(sum(...),
// 0)). What happens to ungraded/unanswered questions in that sum (item 5's
// explicit question):
//   - Unanswered questions (no attempt_responses row at all) contribute 0 —
//     SUM simply never sees a row for them. Skipping a question is not an
//     error at submit time in this phase.
//   - Answered-but-ungraded questions (a row exists but marks_obtained IS
//     NULL — only possible for 'coding' questions in this phase, since MCQ
//     is always graded at submit-response time and psychometric never has
//     a numeric grade at all) ALSO contribute 0 to the sum (SQL SUM ignores
//     NULL), but additionally flip the attempt's final status to
//     'pending_evaluation' instead of 'submitted' — attempt_status_enum's
//     two distinct values map directly onto this: 'submitted' means fully
//     resolved (nothing left to grade), 'pending_evaluation' means at least
//     one response is still awaiting grading (coding, via the future Judge0
//     integration). Psychometric responses never trigger
//     'pending_evaluation' — their NULL is permanent-by-design, not
//     "awaiting" anything.
//
// finalizeAttempt's UPDATE is itself guarded by WHERE status = 'in_progress'
// (see attempts.repository.ts) — a concurrent double-submit finds zero rows
// updated on its second call and this throws ConflictError rather than
// recomputing/overwriting total_score twice. This is a structural,
// DB-level guard against double-scoring, but it is NOT the same as
// CLAUDE.md's Idempotency-Key (Redis-backed) requirement for this route —
// that mechanism (returning the exact same cached response to a literal
// retry with the same Idempotency-Key header) doesn't exist anywhere in
// this codebase yet and hasn't been built here either; flagging this
// explicitly as an open gap against CLAUDE.md's non-negotiable #4 rather
// than silently skipping it.
async function submitAttempt(userId: string, attemptId: string): Promise<AssessmentAttempt> {
  const attempt = await findAttemptOr404(attemptId);
  const studentProfile = await requireStudentProfile(userId);
  assertOwnsAttempt(attempt, studentProfile.id);

  if (attempt.status !== 'in_progress') {
    throw new ConflictError(
      `Cannot submit this attempt — its status is "${attempt.status}", must be "in_progress"`,
    );
  }

  const summary = await attemptsRepository.sumResponsesForAttempt(attemptId);
  const status = summary.hasUngradedCoding ? 'pending_evaluation' : 'submitted';

  const updated = await attemptsRepository.finalizeAttempt(attemptId, {
    status,
    totalScore: summary.totalScore,
  });
  if (!updated) {
    throw new ConflictError('This attempt was already submitted');
  }
  return updated;
}

export const attemptsService = {
  startAttempt,
  getAttemptById,
  listMyAttempts,
  getAttemptQuestions,
  submitResponse,
  submitAttempt,
};
