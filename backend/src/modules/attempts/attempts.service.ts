import type { StudentProfile } from '../../db/types';
import { assessmentsService } from '../assessments/assessments.service';
import { codingService } from '../coding/coding.service';
import type { SubmitCodeInput } from '../coding/coding.schema';
import { notificationsService } from '../notifications/notifications.service';
import { questionBankService } from '../question-bank/question-bank.service';
import { studentsService } from '../students/students.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { logger } from '../../logger';
import { attemptsRepository, type SelectionInput } from './attempts.repository';
import type {
  CreateRetakeRequestInput,
  ListRetakeRequestsQuery,
  RecordProctoringEventInput,
  SubmitResponseInput,
} from './attempts.schema';
import type {
  AssessmentAttempt,
  AssessmentRetakeRequest,
  AttemptQuestionContent,
  AttemptResponse,
  FrozenAttemptQuestion,
  ListRetakeRequestsResult,
  ProctoringEvent,
  SanitizedSavedResponse,
  SubmitCodeResult,
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

  // Part 2: an approved assessment_retake_requests row raises this ceiling
  // by exactly 1 per approval — see this file's module comment on
  // reviewRetakeRequest for the full reasoning on why approval takes
  // effect HERE rather than through some other manual mechanism, and why
  // no "consumed" flag is needed for this to self-correct.
  const [attemptsSoFar, approvedRetakeCount] = await Promise.all([
    attemptsRepository.countAttemptsForStudent(assessmentId, studentProfile.id),
    attemptsRepository.countApprovedRetakeRequestsForStudent(assessmentId, studentProfile.id),
  ]);
  const effectiveMaxAttempts = assessment.maxAttempts + approvedRetakeCount;
  if (attemptsSoFar >= effectiveMaxAttempts) {
    throw new ConflictError(
      `Maximum attempts (${effectiveMaxAttempts}) already used for this assessment`,
    );
  }

  const sections = await assessmentsService.listAssessmentSections(assessmentId);
  // Item 5c fix: resolveQuestionsForSection (not resolveSectionQuestions) —
  // `sections` above already IS every section's full row, so re-fetching
  // each one again by id (what resolveSectionQuestions does internally,
  // plus its own redundant assessment-existence re-check) was pure waste on
  // exactly this hot path. See assessments.service.ts's own comment on
  // resolveQuestionsForSection for the measured before/after.
  const resolvedSections = await Promise.all(
    sections.map((section) => assessmentsService.resolveQuestionsForSection(section)),
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
      // Part 2 refinement: true only when this attempt required an
      // approved retake request to exist at all (i.e. attemptNumber
      // exceeds the assessment's OWN configured maxAttempts) — not simply
      // "attemptNumber > 1", which would also mislabel an assessment's
      // ordinary 2nd/3rd attempt (under a normally-configured
      // maxAttempts > 1, no retake workflow involved) as a "retake."
      isRetake: attemptNumber > assessment.maxAttempts,
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
  // Part 3: threaded through so a reloaded/revisited attempt page can
  // pre-fill what's already been answered — see attempts.types.ts's
  // SanitizedSavedResponse for exactly what's (and isn't) exposed.
  const ownResponses = await attemptsRepository.listOwnResponses(attemptId);
  return Promise.all(
    frozenQuestions.map((frozen) =>
      buildRenderableQuestion(frozen, ownResponses.get(frozen.questionVersionId)),
    ),
  );
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
  savedResponse?: SanitizedSavedResponse,
): Promise<AttemptQuestionContent> {
  const version = await questionBankService.findQuestionVersionContentById(
    frozen.questionVersionId,
  );
  const question = await questionBankService.findQuestionById(version.questionId);

  const enriched: AttemptQuestionContent = { ...frozen, type: question.type };
  if (savedResponse) {
    enriched.savedResponse = savedResponse;
  }

  // Question-level illustrative images (question_images — diagrams/code
  // screenshots/etc attached to the question text itself) apply regardless
  // of type, unlike options/psychometricOptions/coding below — set here,
  // once, ahead of the per-type branching. caption/sortOrder are as safe to
  // expose as the image itself (no scoring metadata involved, same category
  // as coding_question_details' fields further down).
  enriched.images = version.images.map((image) => ({
    id: image.id,
    imageUrl: image.imageUrl,
    caption: image.caption,
    sortOrder: image.sortOrder,
  }));

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

// --- Coding submissions — the first real attempts <-> Judge0 integration ---
//
// attempts NEVER calls integrations/judge0/submission.service.ts or the
// raw Judge0 client directly (CLAUDE.md's boundary rule: only
// modules/coding/ may do that). This function owns everything attempts
// already owns for every other response type — ownership, the
// in_progress gate, frozen-selection membership, question-type
// validation, upserting the response row — and delegates the actual
// Judge0 orchestration + coding_submissions persistence to
// codingService.gradeSubmission (a cross-module SERVICE call).
//
// Three-step write, deliberately NOT one DB transaction:
//   1. Upsert a placeholder attempt_responses row (no grade yet) — this
//      is what gives coding_submissions.attempt_response_id a valid FK
//      target to reference before grading even starts.
//   2. Call codingService.gradeSubmission — a Judge0 HTTP round-trip that
//      can take several seconds across N polled test cases.
//   3. Re-read the response row's CURRENT state, compare the new result
//      against it, and only overwrite if the new result is at least as
//      good — see "Best result wins" below.
// A DB transaction must never stay open across an external network call
// of unbounded/retried duration (CLAUDE.md's reliability posture already
// implies this — see integrations/judge0/client.ts's own
// timeout/retry/circuit-breaker machinery, which this sequence sits on
// top of, not inside a lock). If step 2 throws (Judge0 unreachable — see
// codingService.gradeSubmission's own module comment for the
// all-or-nothing reasoning there), the response row is left in its
// step-1 placeholder state (or, on a resubmission, whatever grade already
// existed before this call) — a harmless, honest signal, never silently
// fabricated and never left half-graded.
//
// Best result wins, not "always latest": a resubmission that scores worse
// than a prior submission for the same question must NOT overwrite the
// better recorded grade. The comparison happens right before step 3's
// final upsertResponse call, using ANOTHER call to
// attemptsRepository.upsertResponse(attemptId, questionVersionId, {}) —
// the exact same no-op-on-conflict pattern step 1 already relies on
// (every field undefined, so Drizzle's undefined-skip behavior means the
// UPDATE branch touches only updated_at and RETURNING gives back the
// row's untouched current is_correct/marks_obtained). This is a single
// cheap, already-indexed UPDATE...RETURNING — not a new repository
// function, and NOT a new long-running operation: it runs entirely AFTER
// Judge0 grading has already completed, so it does not reintroduce any
// transaction-spanning-external-call problem (no DB transaction is ever
// open here, and nothing in this comparison waits on Judge0 again).
// Re-reading at this point, rather than reusing step 1's `placeholder`
// value captured minutes-of-Judge0-polling earlier, also keeps this
// comparison's race window as narrow as it can be — a concurrent
// resubmission could in principle still interleave between this read and
// the write immediately below it, but that window is now just these two
// statements, not the entire step 1-through-2 Judge0 duration.
//
// Grading formula (item 2's explicit question): PROPORTIONAL credit, not
// all-or-nothing. marksObtained = version.marks * (testCasesPassed /
// testCasesTotal), rounded to 2 decimal places (this codebase's
// numeric-column string convention). isCorrect = every test case passed
// (still a strict "fully correct" boolean signal, the same role it
// already plays for MCQ — just computed from a pass rate instead of a
// single option). Neither CLAUDE.md nor schema.sql specifies which
// policy to use; proportional was chosen because this is explicitly a
// "Placement TRAINING assessment platform" (CLAUDE.md's own framing) —
// rewarding partial progress on a coding problem is the pedagogically
// standard choice for a training tool (mirrors HackerRank/LeetCode-style
// partial scoring), whereas all-or-nothing would zero out a solution
// that passes 9 of 10 test cases, unusually harsh for this context. Say
// so if you want all-or-nothing instead — it's a one-line change
// (`isCorrect ? version.marks : '0'`).
async function submitCode(
  userId: string,
  attemptId: string,
  questionVersionId: string,
  input: SubmitCodeInput,
): Promise<SubmitCodeResult> {
  const attempt = await findAttemptOr404(attemptId);
  const studentProfile = await requireStudentProfile(userId);
  assertOwnsAttempt(attempt, studentProfile.id);

  if (attempt.status !== 'in_progress') {
    throw new ConflictError(
      `Cannot submit code — this attempt's status is "${attempt.status}", must be "in_progress"`,
    );
  }

  const selection = await attemptsRepository.findSelection(attemptId, questionVersionId);
  if (!selection) {
    throw new ValidationError('This question is not part of this attempt');
  }

  const version = await questionBankService.findQuestionVersionContentById(questionVersionId);
  const question = await questionBankService.findQuestionById(version.questionId);
  if (question.type !== 'coding') {
    throw new ValidationError(
      `This endpoint is only valid for "coding" questions (this question is "${question.type}")`,
    );
  }

  // Phase 1: ensure the response row exists before Judge0 grading runs.
  const placeholder = await attemptsRepository.upsertResponse(attemptId, questionVersionId, {});

  // Phase 2: Judge0 orchestration + coding_submissions persistence — the
  // cross-module service call. Mapped explicitly onto coding.types.ts's
  // own shapes rather than passing question-bank's raw row types through,
  // so modules/coding stays decoupled from question-bank's exact schema
  // (see coding.types.ts's CodingDetailsInput/TestCaseInput comments).
  // supportedLanguages is cast the same way buildRenderableQuestion above
  // already does — untyped JSONB at the Drizzle level.
  const { testCasesPassed, testCasesTotal } = await codingService.gradeSubmission({
    attemptResponseId: placeholder.id,
    language: input.language,
    sourceCode: input.sourceCode,
    codingDetails: version.codingDetails
      ? {
          timeLimitMs: version.codingDetails.timeLimitMs,
          memoryLimitKb: version.codingDetails.memoryLimitKb,
          supportedLanguages: version.codingDetails.supportedLanguages as string[],
        }
      : null,
    testCases: version.testCases.map((testCase) => ({
      id: testCase.id,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      isHidden: testCase.isHidden,
      sortOrder: testCase.sortOrder,
    })),
  });

  const isCorrect = testCasesTotal > 0 && testCasesPassed === testCasesTotal;
  const marksObtained =
    testCasesTotal > 0
      ? (Number(version.marks) * (testCasesPassed / testCasesTotal)).toFixed(2)
      : '0';

  // Phase 3a: cheap re-read (see this function's module comment on why
  // this isn't a new long-running operation) to compare against whatever
  // grade is currently recorded.
  const current = await attemptsRepository.upsertResponse(attemptId, questionVersionId, {});
  const existingMarksObtained =
    current.marksObtained !== null ? Number(current.marksObtained) : null;

  if (existingMarksObtained !== null && Number(marksObtained) < existingMarksObtained) {
    // This submission scored worse than what's already recorded — keep
    // the existing (better) grade untouched, but still report THIS
    // submission's own test-case tally back (see attempts.types.ts's
    // SubmitCodeResult comment on why these two are never "stale").
    return { ...current, testCasesPassed, testCasesTotal };
  }

  // Phase 3b: no prior grade existed, or the new result is >= the
  // existing one — write it onto the SAME response row.
  const updated = await attemptsRepository.upsertResponse(attemptId, questionVersionId, {
    isCorrect,
    marksObtained,
  });
  return { ...updated, testCasesPassed, testCasesTotal };
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
// DB-level guard against double-scoring, on top of which
// attempts.routes.ts now also wires CLAUDE.md's Idempotency-Key
// requirement (plugins/idempotency.plugin.ts) directly onto this route —
// a literal retry with the same Idempotency-Key header replays the exact
// cached response instead of re-entering this function at all.
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

  // Notification trigger (notifications module, item 6): fires ONLY when
  // the resulting status is 'submitted' — the score is genuinely ready.
  // When hasUngradedCoding is true the status is 'pending_evaluation'
  // instead, meaning totalScore isn't final yet; notifying "your score is
  // ready" in that state would be misleading. Confirmed (not assumed, via
  // grep) that nothing else in this codebase currently transitions a
  // pending_evaluation attempt back to submitted later — there is no
  // manual-coding-grading endpoint yet — so this notification simply
  // doesn't fire for that path in this phase; a future grading feature
  // would need its own trigger call at whatever point IT finalizes the
  // score.
  //
  // studentProfile here is the CALLER's own profile (requireStudentProfile
  // above, resolved from the JWT), and assertOwnsAttempt already confirmed
  // studentProfile.id === attempt.studentId — so studentProfile.userId is
  // exactly the recipient's users.id, no extra lookup needed.
  //
  // Not awaited (fire-and-forget, item 3) — same reasoning as
  // publishAssessment's wiring in assessments.service.ts: submitAttempt's
  // return below is unaffected by notification/email latency or failure.
  if (updated.status === 'submitted') {
    void notificationsService.notifyAttemptFinalized(updated, studentProfile.userId).catch((err) => {
      logger.error({ err, attemptId }, 'notifyAttemptFinalized rejected unexpectedly');
    });
  }

  return updated;
}

// --- Proctoring events (Part 2, item 2) ---
//
// Gating decision: TYPE-SPECIFIC, not a blanket accept-everything or
// reject-everything tied to whether the assessment requires proctoring at
// all. proctoring_event_type_enum has 6 values; only two map to a
// specific proctoring FEATURE flag on the assessment —  'camera_flag'
// (assessment.proctoringCameraRequired) and 'fullscreen_exit'
// (assessment.proctoringFullscreenRequired). The other four (tab_switch,
// copy_paste, network_disconnect, window_blur) are generic integrity
// signals with no assessment-level flag tying them to a specific
// proctoring feature — they make sense to log regardless of whether
// camera/fullscreen enforcement is on for this assessment. A blanket
// "reject unless proctoring is required" policy would incorrectly reject
// those four even when logging them is harmless; a blanket
// "accept everything" policy would let a client log a camera_flag against
// an assessment that never asked for camera access at all, which is
// nonsensical data. Type-specific gating is the only option that actually
// matches what each event type means.
function assertProctoringEventAllowed(
  assessment: { proctoringCameraRequired: boolean; proctoringFullscreenRequired: boolean },
  eventType: RecordProctoringEventInput['eventType'],
): void {
  if (eventType === 'camera_flag' && !assessment.proctoringCameraRequired) {
    throw new ValidationError(
      'camera_flag events are not accepted for an assessment that does not require camera proctoring',
    );
  }
  if (eventType === 'fullscreen_exit' && !assessment.proctoringFullscreenRequired) {
    throw new ValidationError(
      'fullscreen_exit events are not accepted for an assessment that does not require fullscreen proctoring',
    );
  }
}

// Student, during an in_progress attempt only (item 2's explicit
// instruction) — reuses assertOwnsAttempt exactly as Part 1's other
// student-facing mutations do. Append-only: no update/delete function
// exists anywhere in this module, matching proctoring_events' schema (no
// updated_at, no deleted_at).
async function recordProctoringEvent(
  userId: string,
  attemptId: string,
  input: RecordProctoringEventInput,
): Promise<ProctoringEvent> {
  const attempt = await findAttemptOr404(attemptId);
  const studentProfile = await requireStudentProfile(userId);
  assertOwnsAttempt(attempt, studentProfile.id);

  if (attempt.status !== 'in_progress') {
    throw new ConflictError(
      `Cannot record a proctoring event — this attempt's status is "${attempt.status}", must be "in_progress"`,
    );
  }

  const assessment = await assessmentsService.findAssessmentById(attempt.assessmentId);
  assertProctoringEventAllowed(assessment, input.eventType);

  return attemptsRepository.createProctoringEvent({
    attemptId,
    eventType: input.eventType,
    eventMeta: input.eventMeta,
  });
}

// Staff-facing (item 2) — gated at the ROUTE level by attempts.reassign
// (see attempts.routes.ts's module comment on why this reuses that key
// rather than inventing a new one). No self-ownership check: this is
// explicitly NOT a student-facing read.
async function listProctoringEvents(attemptId: string): Promise<ProctoringEvent[]> {
  await findAttemptOr404(attemptId);
  return attemptsRepository.listProctoringEventsForAttempt(attemptId);
}

// --- Retake requests (Part 2, item 3) ---
//
// Attempt eligibility: attempt_status_enum, confirmed directly against
// schema.sql rather than assumed, is exactly ('not_started', 'in_progress',
// 'submitted', 'pending_evaluation', 'invalidated') — there is NO
// 'completed' value. The task's own framing ("their own invalidated/
// completed attempt") doesn't match the real enum; the correct reading is
// "any TERMINAL attempt" — everything except 'not_started'/'in_progress',
// i.e. 'submitted' | 'pending_evaluation' | 'invalidated'. A retake
// request for an attempt that hasn't finished yet doesn't make sense (the
// student should just continue/submit it normally).
const RETAKE_ELIGIBLE_STATUSES: AssessmentAttempt['status'][] = [
  'submitted',
  'pending_evaluation',
  'invalidated',
];

function assertRetakeEligible(attempt: AssessmentAttempt): void {
  if (!RETAKE_ELIGIBLE_STATUSES.includes(attempt.status)) {
    throw new ConflictError(
      `Cannot request a retake — this attempt's status is "${attempt.status}", must be one of ${RETAKE_ELIGIBLE_STATUSES.join(', ')}`,
    );
  }
}

// Student, self-ownership + terminal-attempt-status gate. requestedBy is
// the caller's users.id directly (assessment_retake_requests.requested_by
// references users(id), unlike assessment_attempts.student_id which
// references student_profiles(id) — no extra resolution needed here).
async function createRetakeRequest(
  userId: string,
  attemptId: string,
  input: CreateRetakeRequestInput,
): Promise<AssessmentRetakeRequest> {
  const attempt = await findAttemptOr404(attemptId);
  const studentProfile = await requireStudentProfile(userId);
  assertOwnsAttempt(attempt, studentProfile.id);
  assertRetakeEligible(attempt);

  // Guard against duplicate spam — nothing in schema.sql prevents multiple
  // requests for the same attempt (no UNIQUE constraint), so this is a
  // service-layer check, same discipline as every other DB-doesn't-
  // enforce-it invariant already established in this codebase (e.g.
  // assertSelectionMode in assessments.service.ts).
  const existingPending = await attemptsRepository.findPendingRetakeRequestForAttempt(attemptId);
  if (existingPending) {
    throw new ConflictError('A retake request for this attempt is already pending');
  }

  return attemptsRepository.createRetakeRequest({
    attemptId,
    requestedBy: userId,
    reason: input.reason,
  });
}

// --- Retake request review (staff) — item 3's approval-mechanism question ---
//
// Does approving a retake request automatically grant an extra attempt, or
// is it just a record a human then acts on manually via some other
// mechanism? ANSWER: approval ACTUALLY GRANTS the extra attempt — it is
// not advisory. Reasoning:
//   1. retake_status_enum has exactly 3 values — 'pending' | 'approved' |
//      'rejected' (confirmed against schema.sql, not assumed). There is no
//      'granted'/'consumed' state, and assessment_retake_requests has no
//      column linking it forward to a specific new assessment_attempts
//      row. If approval were purely advisory, there would be no
//      schema-level way to even represent "this approval has been acted
//      on" — the feature would be structurally incomplete without a
//      second, undocumented mechanism outside this API.
//   2. attempts.reassign's own seeded description ("Reassign/retake an
//      attempt") already signals this action taking real effect, not
//      recording an opinion for someone else to action manually later.
//   3. Every other approval workflow already built in this codebase
//      (question-bank's question_approval_history, assessments'
//      assessment_approval_history) makes its approval action DO the
//      thing (flip a status, unlock a capability) — a no-op "approval"
//      here would be the first inconsistent exception.
//
// Mechanism: this DID require a real code change to startAttempt (see
// above) — its max-attempts check now reads
// `assessment.maxAttempts + countApprovedRetakeRequestsForStudent(...)` as
// the effective ceiling, instead of maxAttempts alone. No "consumed" flag
// is needed on assessment_retake_requests: the ceiling is naturally
// self-correcting, since attemptsSoFar (a straight count of
// assessment_attempts rows) rises by exactly 1 every time the student
// actually uses the extra attempt, closing the gap back to equality with
// the raised ceiling — a second retake beyond that requires a second
// approved request, not a stale reuse of the first.
async function reviewRetakeRequest(
  retakeRequestId: string,
  reviewedBy: string,
  status: 'approved' | 'rejected',
): Promise<AssessmentRetakeRequest> {
  const updated = await attemptsRepository.reviewRetakeRequest(retakeRequestId, {
    status,
    reviewedBy,
  });
  if (updated) {
    return updated;
  }

  const existing = await attemptsRepository.findRetakeRequestById(retakeRequestId);
  if (!existing) {
    throw new NotFoundError('Retake request not found');
  }
  throw new ConflictError(
    `Cannot review this retake request — its status is already "${existing.status}"`,
  );
}

// Both approve/reject wrappers fire notifyRetakeRequestReviewed the same
// way (item 6) — AFTER reviewRetakeRequest has already committed the
// status change, not awaited (fire-and-forget, item 3), same reasoning as
// publishAssessment's and submitAttempt's wiring. notifyRetakeRequestReviewed
// itself reads the row's own `status` field to decide the approved-vs-
// rejected copy/type, so both call sites can share the exact same trigger
// call rather than duplicating notification-building logic per outcome.
async function approveRetakeRequest(
  retakeRequestId: string,
  reviewedBy: string,
): Promise<AssessmentRetakeRequest> {
  const updated = await reviewRetakeRequest(retakeRequestId, reviewedBy, 'approved');
  void notificationsService.notifyRetakeRequestReviewed(updated).catch((err) => {
    logger.error({ err, retakeRequestId }, 'notifyRetakeRequestReviewed rejected unexpectedly');
  });
  return updated;
}

async function rejectRetakeRequest(
  retakeRequestId: string,
  reviewedBy: string,
): Promise<AssessmentRetakeRequest> {
  const updated = await reviewRetakeRequest(retakeRequestId, reviewedBy, 'rejected');
  void notificationsService.notifyRetakeRequestReviewed(updated).catch((err) => {
    logger.error({ err, retakeRequestId }, 'notifyRetakeRequestReviewed rejected unexpectedly');
  });
  return updated;
}

// Staff-facing worklist — gated at the route level by attempts.reassign.
// Deliberately NOT self-scoped: this is the oversight surface for staff to
// see every student's pending/approved/rejected requests, filterable by
// status/attemptId.
async function listRetakeRequests(
  query: ListRetakeRequestsQuery,
): Promise<ListRetakeRequestsResult> {
  const { items, total } = await attemptsRepository.listRetakeRequests({
    status: query.status,
    attemptId: query.attemptId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export const attemptsService = {
  startAttempt,
  getAttemptById,
  listMyAttempts,
  getAttemptQuestions,
  submitResponse,
  submitCode,
  submitAttempt,
  recordProctoringEvent,
  listProctoringEvents,
  createRetakeRequest,
  approveRetakeRequest,
  rejectRetakeRequest,
  listRetakeRequests,
};
