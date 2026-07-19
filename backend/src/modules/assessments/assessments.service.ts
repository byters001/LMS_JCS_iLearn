import type {
  Assessment,
  AssessmentQuestion,
  AssessmentSection,
  AssessmentSectionPool,
} from '../../db/types';
import { notificationsService } from '../notifications/notifications.service';
import { organizationService } from '../organization/organization.service';
import { questionBankService } from '../question-bank/question-bank.service';
import { studentsService } from '../students/students.service';
import { trainersService } from '../trainers/trainers.service';
import { getRoleAssignmentsForUser } from '../../rbac/role-assignments';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app-error';
import { logger } from '../../logger';
import { assessmentsRepository, type PoolUsageRow } from './assessments.repository';
import type {
  AssessmentApprovalActionInput,
  CreateAssessmentInput,
  CreateAssessmentQuestionInput,
  CreateAssessmentSectionInput,
  CreateAssessmentSectionPoolInput,
  ListAssessmentApprovalHistoryQuery,
  ListAssessmentsQuery,
  ListAvailableAssessmentsQuery,
  ScheduleAssessmentInput,
  UpdateAssessmentInput,
  UpdateAssessmentQuestionInput,
  UpdateAssessmentSectionInput,
} from './assessments.schema';
import type {
  AssessmentSectionWithResolvedQuestions,
  AssessmentWithBatches,
  FullAssessment,
  ListAssessmentsResult,
  ListQuestionApprovalHistoryResult,
  ResolvedAssessmentQuestion,
  ResolvedSectionQuestions,
} from './assessments.types';

// --- Cross-module boundary notes (this file's first genuine
// business-logic cross-module dependency, not just an FK existence check)
// ---
//
// CLAUDE.md's rule: a module may call another module's SERVICE, never its
// repository. Three such calls live in this file:
//
// 1. trainersService.findTrainingSessionById(trainingSessionId) — assessments.
//    training_session_id references training_sessions(id), a table owned by
//    trainers.schema.ts. That lookup didn't exist anywhere before this
//    phase; added as a small, additive findTrainingSessionById to
//    trainers.repository.ts/service.ts rather than querying the table
//    directly from here.
//
// 2. organizationService.findBatchById(batchId) — already existed; used to
//    validate assessment_batches' batch_id (see module comment below).
//
// 3. questionBankService.{findQuestionVersionContentById, findQuestionById,
//    findQuestionPoolById, resolveQuestionPool} — the real cross-module
//    REUSE the task asked about. resolveSectionQuestions (below) does not
//    re-implement pool-criteria resolution; a 'pool' section calls
//    question-bank's own resolveQuestionPool (Part 3) per attached pool and
//    flattens the results. This is qualitatively different from #1/#2
//    (existence checks) — it's calling into another module's actual
//    business logic and reusing its output shape (ResolvedQuestionPool)
//    directly in this module's own response type.
//
// --- assessment_questions vs assessment_section_pools (confirmed against
// schema.sql directly, per the task) ---
//
// assessment_sections.selection_mode (enum: 'manual' | 'pool') decides which
// of the two tables is authoritative for a given section:
//   - 'manual': assessment_questions rows are an explicit, ordered list of
//     specific question_version_id values chosen by a human. Getting "this
//     section's questions" is a plain join to question_versions.
//   - 'pool': assessment_section_pools rows reference question_pools, not
//     questions directly — assessment_section_pools has NO question_id/
//     question_version_id column at all (checked schema.sql directly). The
//     actual questions only exist as a result of RE-RUNNING that pool's
//     criteria (question_pool_criteria, resolved by question-bank's
//     resolveQuestionPool) — there is nothing to "just join" here; it's a
//     dynamic computation, potentially producing a different draw each call
//     (ORDER BY random() in question-bank.repository.ts's
//     resolveCriterionQuestions), by design (schema.sql's own top-of-file
//     comment: "pool-based randomized assessments with frozen selections
//     per attempt" — the actual FREEZING into a fixed set happens later, at
//     attempt time, via attempt_question_selections, which is explicitly
//     out of scope for this phase).
//
// Both tables can theoretically hold rows for the same section regardless
// of selection_mode (nothing in the DB stops it) — assertSelectionMode
// below is the service-layer guard that keeps them mutually exclusive in
// practice, mirroring every other DB-doesn't-enforce-it invariant already
// established in this codebase (assertVersionMutable, assertTypeSpecificPayloadsMatch).

// --- Approval workflow ---
//
// assessment_status_enum (schema.sql): draft, review, approved, scheduled,
// live, completed, archived — 7 values, NOT the same set as questions'
// 5-value question_status_enum. assessment_approval_action_enum: submitted,
// approved, rejected, scheduled, published — 5 actions, versus questions'
// 3. Read, confirmed directly against schema.sql (not assumed to mirror
// question-bank): nothing enforces status transitions at the DB level here
// either (no CHECK constraint, no trigger) — same service-layer-only
// enforcement as question-bank Part 3.
//
// Notable asymmetry vs questions: there is NO 'rejected' status in
// assessment_status_enum, even though 'rejected' IS a valid action. A
// rejected assessment has nowhere dedicated to go, so reject reverts status
// to 'draft' (the action is still recorded in assessment_approval_history —
// the audit trail shows it was rejected even though the status column
// doesn't have a distinct value for it).
//
// The five actions chart a single linear path with one reject branch:
//   draft --submit--> review --approve--> approved --schedule--> scheduled --publish--> live
//                            \--reject--> draft
// 'completed'/'archived' are deliberately NOT reachable through any action
// endpoint here — nothing in assessment_approval_action_enum corresponds to
// them (no 'completed'/'archived' action exists), and CLAUDE.md's jobs/
// folder (leaderboard-rebuild, program-archival, temp-storage-purge,
// scheduler) strongly suggests those are time/attempt-driven transitions
// for a future phase, not an approval decision — same reasoning
// question-bank Part 3 used to leave 'archived' untouched there.
const SUBMITTABLE_STATUSES: Assessment['status'][] = ['draft'];

function assertAssessmentEditable(assessment: Assessment): void {
  if (assessment.status !== 'draft') {
    throw new ConflictError(
      `Cannot modify assessment content while status is "${assessment.status}" — only "draft" assessments can be edited`,
    );
  }
}

// Same class of bug as scheduleAssessment's startAt/endAt fix, same class
// of resolution: batchIds is an authorization list ("who may attempt
// this"), not assessment CONTENT (sections/questions) — it has no reason
// to share assertAssessmentEditable's draft-only gate, which exists
// specifically because section/question content needs to freeze once
// review starts (it affects what students would see). Who's authorized to
// attempt isn't frozen by review/approval/scheduling — it only stops
// mattering to change once students may already be mid-attempt, which is
// status='live' (and everything after: 'completed'/'archived'). So
// batchIds stays editable through draft, review, approved, AND scheduled,
// and only locks at live/completed/archived — a materially wider window
// than assertAssessmentEditable's, by design, not an oversight.
const BATCH_LOCKED_STATUSES: Assessment['status'][] = ['live', 'completed', 'archived'];

function assertBatchesEditable(assessment: Assessment): void {
  if (BATCH_LOCKED_STATUSES.includes(assessment.status)) {
    throw new ConflictError(
      `Cannot modify assessment batches while status is "${assessment.status}" — batches can only be changed before an assessment goes live`,
    );
  }
}

function assertSelectionMode(section: AssessmentSection, required: 'manual' | 'pool'): void {
  if (section.selectionMode !== required) {
    throw new ValidationError(
      `This section's selection_mode is "${section.selectionMode}" — this operation requires "${required}"`,
    );
  }
}

// Enforces the invariant nothing in the DB schema itself guards: content
// added to a section must match the parent assessment's test_category,
// unless the assessment is 'mixed' (which accepts any type by design).
// question_type_enum and test_category_enum happen to share the same three
// non-"mixed" literal values ('mcq' | 'coding' | 'psychometric'), so this is
// a direct comparison, not a mapping table.
function assertMatchesTestCategory(
  assessment: Assessment,
  contentType: 'mcq' | 'coding' | 'psychometric',
): void {
  if (assessment.testCategory !== 'mixed' && assessment.testCategory !== contentType) {
    throw new ValidationError(
      `This assessment's test_category is "${assessment.testCategory}" — content of type "${contentType}" is not allowed (only "mixed" assessments accept any type)`,
    );
  }
}

// --- Assessments ---
//
// assessment_batches ("who can take this assessment") is modeled as part of
// assessment create/update rather than a separate top-level CRUD resource.
// Reasoning: it's a pure join table with no lifecycle columns of its own
// (schema.sql gives it just id/assessment_id/batch_id/created_at) — the
// same shape as training_program_trainers, which DOES get its own nested
// CRUD, but that table has a real per-row attribute (role_in_program) worth
// managing independently. assessment_batches has no such attribute — a
// batch either can or can't take the assessment, nothing else to set per
// row — so there's nothing an incremental add/remove endpoint would offer
// over "the current list is exactly what create/update said it should be."
// Treating it as a replace-the-whole-set field (batchIds) on create/update
// keeps "which batches can attempt this" atomic with the rest of the
// assessment's configuration, and avoids a caller ever observing a
// half-updated batch list. A read-only listAssessmentBatches is still
// exposed (below) since querying "who can take this" independently of a
// full re-fetch is legitimately useful.

// Item 6 — GET /assessments is gated by 'assessments.create', a permission
// schema.sql grants to BOTH super_admin and faculty (requireAnyPermission-
// free single-key route — see assessments.routes.ts's ASSESSMENTS_MANAGE).
// This was originally left unscoped for both roles as a deliberate design
// choice: they were assumed equally trusted to see the full platform list.
// That assumption doesn't hold for faculty in practice (a trainer could see
// every assessment platform-wide, not just their own), so this is a real
// BEHAVIOR CHANGE for faculty, not a pure bug fix — flagging that
// explicitly rather than presenting it as a silent correction.
//
// super_admin's path is required to stay completely unscoped, byte-for-
// byte. Role identity (not the shared assessments.create permission
// itself, which can't distinguish the two roles) is what decides the
// branch — getRoleAssignmentsForUser is queried fresh rather than trusting
// permissionCache, since permission KEYS don't carry role SLUG identity at
// all (confirmed: rbac/permission-cache.ts stores PermissionKey[], never a
// role). Returns undefined for a super_admin caller (assessmentsRepository.
// listAssessments treats undefined as "no filter, run the original query
// unchanged" — see that function's own comment) and a real batch id array
// (possibly empty) for anyone else who reached this far, which given this
// route's own permission gate can only be faculty.
async function resolveAssessmentListBatchScope(userId: string): Promise<string[] | undefined> {
  const roleAssignments = await getRoleAssignmentsForUser(userId);
  const isSuperAdmin = roleAssignments.some(
    (assignment) => assignment.role.slug === 'super_admin',
  );
  if (isSuperAdmin) {
    return undefined;
  }

  const trainerBatchAssignments = await organizationService.listBatchAssignmentsForTrainers([
    userId,
  ]);
  return trainerBatchAssignments.map((assignment) => assignment.batchId);
}

async function listAssessments(
  userId: string,
  query: ListAssessmentsQuery,
): Promise<ListAssessmentsResult> {
  const batchIds = await resolveAssessmentListBatchScope(userId);

  const { items, total } = await assessmentsRepository.listAssessments({
    trainingSessionId: query.trainingSessionId,
    status: query.status,
    testCategory: query.testCategory,
    search: query.search,
    batchIds,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

// Self-scoped, permission-free — same authorization model as
// attempts.service.ts's requireStudentProfile (schema.sql seeds the
// 'student' role with ZERO permission keys, so requirePermission(<anything>)
// would reject every student; a caller with no student_profiles row for
// their JWT user id is rejected here instead, by data, not by an RBAC key).
// Duplicated here rather than imported from attempts.service.ts because
// that function isn't exported (module-local helper) and modules may only
// call each other's exported SERVICE functions, never reach into another
// module's internals to grab a private helper.
async function requireStudentProfile(userId: string) {
  const studentProfile = await studentsService.findStudentProfileByUserId(userId);
  if (!studentProfile) {
    throw new ForbiddenError('Only students may view available assessments');
  }
  return studentProfile;
}

// The actual gap this phase closes: GET /assessments (listAssessments
// above) is staff-only (assessments.create) and has no batch scoping at
// all — unusable and, if the permission model ever changed, a real
// cross-batch data leak for student-facing UI. This resolves the caller's
// OWN active batch ids (studentsService.listActiveBatchIdsForStudent —
// already exported for exactly this purpose, see its own comment) and
// passes them to the repository's batch-joined query, so a student only
// ever sees assessments their own batch is actually authorized for — the
// same assessment_batches check attempts.service.ts's assertBatchAuthorized
// enforces at attempt-creation time, surfaced here as a list instead.
async function listAvailableAssessments(
  userId: string,
  query: ListAvailableAssessmentsQuery,
): Promise<ListAssessmentsResult> {
  const studentProfile = await requireStudentProfile(userId);
  const batchIds = await studentsService.listActiveBatchIdsForStudent(studentProfile.id);

  const { items, total } = await assessmentsRepository.listAvailableAssessments({
    batchIds,
    status: query.status,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findAssessmentById(id: string): Promise<Assessment> {
  const assessment = await assessmentsRepository.findAssessmentById(id);
  if (!assessment) {
    throw new NotFoundError('Assessment not found');
  }
  return assessment;
}

async function findAssessmentWithBatches(id: string): Promise<AssessmentWithBatches> {
  const assessment = await findAssessmentById(id);
  const batchIds = await assessmentsRepository.listAssessmentBatchIds(id);
  return { ...assessment, batchIds };
}

async function listAssessmentBatches(id: string): Promise<string[]> {
  await findAssessmentById(id);
  return assessmentsRepository.listAssessmentBatchIds(id);
}

function assertValidDateRange(startAt?: Date | null, endAt?: Date | null): void {
  if (startAt && endAt && startAt.getTime() >= endAt.getTime()) {
    throw new ValidationError('startAt must be before endAt');
  }
}

async function createAssessment(
  input: CreateAssessmentInput,
  createdBy: string,
): Promise<AssessmentWithBatches> {
  // Cross-entity check, same pattern as prior phases' FK-existence checks
  // (e.g. organization.service.ts's createDepartment validating collegeId):
  // training_sessions has no deleted_at column in schema.sql (checked
  // directly), so existence is the whole check — findTrainingSessionById
  // already 404s if missing, nothing further to layer on top. Guarded now
  // that trainingSessionId is optional (item 4) — omitted entirely means
  // "no session," not "validate a session that doesn't exist."
  if (input.trainingSessionId) {
    await trainersService.findTrainingSessionById(input.trainingSessionId);
  }

  const batchIds = input.batchIds ?? [];
  await Promise.all(batchIds.map((batchId) => organizationService.findBatchById(batchId)));

  assertValidDateRange(input.startAt, input.endAt);

  const assessment = await assessmentsRepository.createAssessmentWithBatches(
    { ...input, createdBy },
    batchIds,
  );
  return { ...assessment, batchIds };
}

async function updateAssessment(
  id: string,
  input: UpdateAssessmentInput,
  updatedBy: string,
): Promise<AssessmentWithBatches> {
  const existing = await findAssessmentById(id);

  // batchIds gets its OWN gate (assertBatchesEditable), separate from
  // every other field's assertAssessmentEditable — a single PATCH can
  // legitimately mix the two (e.g. batchIds alongside title), so each
  // half of the body is checked against the field(s) it actually touches,
  // not gated as one all-or-nothing operation. A batchIds-only PATCH while
  // status='review'/'approved'/'scheduled' now succeeds where it used to
  // 409; a title-only (or mixed) PATCH in those same statuses still 409s
  // exactly as before — assertAssessmentEditable itself is unchanged.
  const { batchIds, ...rest } = input;
  if (Object.keys(rest).length > 0) {
    assertAssessmentEditable(existing);
  }
  if (batchIds !== undefined) {
    assertBatchesEditable(existing);
  }

  if (batchIds) {
    await Promise.all(batchIds.map((batchId) => organizationService.findBatchById(batchId)));
  }

  const nextStartAt = input.startAt !== undefined ? input.startAt : existing.startAt;
  const nextEndAt = input.endAt !== undefined ? input.endAt : existing.endAt;
  assertValidDateRange(nextStartAt, nextEndAt);

  const updated = await assessmentsRepository.updateAssessment(id, { ...rest, updatedBy });
  if (!updated) {
    throw new NotFoundError('Assessment not found');
  }

  if (batchIds) {
    await assessmentsRepository.replaceAssessmentBatches(id, batchIds);
  }

  const finalBatchIds = await assessmentsRepository.listAssessmentBatchIds(id);
  return { ...updated, batchIds: finalBatchIds };
}

async function deleteAssessment(id: string): Promise<void> {
  const existing = await findAssessmentById(id);
  assertAssessmentEditable(existing);
  await assessmentsRepository.deleteAssessment(id);
}

// --- Assessment sections ---

async function listAssessmentSections(assessmentId: string): Promise<AssessmentSection[]> {
  await findAssessmentById(assessmentId);
  return assessmentsRepository.listAssessmentSections(assessmentId);
}

async function findAssessmentSectionById(
  assessmentId: string,
  sectionId: string,
): Promise<AssessmentSection> {
  await findAssessmentById(assessmentId);
  const section = await assessmentsRepository.findAssessmentSectionById(sectionId);
  if (!section || section.assessmentId !== assessmentId) {
    throw new NotFoundError('Assessment section not found');
  }
  return section;
}

async function createAssessmentSection(
  assessmentId: string,
  input: CreateAssessmentSectionInput,
  createdBy: string,
): Promise<AssessmentSection> {
  const assessment = await findAssessmentById(assessmentId);
  assertAssessmentEditable(assessment);

  return assessmentsRepository.createAssessmentSection(assessmentId, { ...input, createdBy });
}

async function updateAssessmentSection(
  assessmentId: string,
  sectionId: string,
  input: UpdateAssessmentSectionInput,
  updatedBy: string,
): Promise<AssessmentSection> {
  const assessment = await findAssessmentById(assessmentId);
  assertAssessmentEditable(assessment);
  await findAssessmentSectionById(assessmentId, sectionId);

  const updated = await assessmentsRepository.updateAssessmentSection(sectionId, {
    ...input,
    updatedBy,
  });
  if (!updated) {
    throw new NotFoundError('Assessment section not found');
  }
  return updated;
}

async function deleteAssessmentSection(assessmentId: string, sectionId: string): Promise<void> {
  const assessment = await findAssessmentById(assessmentId);
  assertAssessmentEditable(assessment);
  await findAssessmentSectionById(assessmentId, sectionId);
  await assessmentsRepository.deleteAssessmentSection(sectionId);
}

// --- Assessment questions (manual selection_mode) ---

async function listAssessmentQuestions(
  assessmentId: string,
  sectionId: string,
): Promise<AssessmentQuestion[]> {
  await findAssessmentSectionById(assessmentId, sectionId);
  return assessmentsRepository.listAssessmentQuestions(sectionId);
}

async function createAssessmentQuestion(
  assessmentId: string,
  sectionId: string,
  input: CreateAssessmentQuestionInput,
): Promise<AssessmentQuestion> {
  const assessment = await findAssessmentById(assessmentId);
  assertAssessmentEditable(assessment);
  const section = await findAssessmentSectionById(assessmentId, sectionId);
  assertSelectionMode(section, 'manual');

  // Cross-module reuse (not a bare existence check): the version's content
  // AND its parent question's approval status both matter here — only
  // approved questions should be addable to a live-bound assessment, same
  // filter question-bank's own pool resolution applies (status = 'approved'
  // in resolveCriterionQuestions). Keeps manual and pool selection
  // consistent in what they're allowed to surface.
  const version = await questionBankService.findQuestionVersionContentById(
    input.questionVersionId,
  );
  const question = await questionBankService.findQuestionById(version.questionId);
  if (question.status !== 'approved') {
    throw new ValidationError(
      `Question is not approved (status: "${question.status}") — only approved questions can be added to an assessment`,
    );
  }
  assertMatchesTestCategory(assessment, question.type);

  return assessmentsRepository.createAssessmentQuestion(sectionId, input);
}

async function updateAssessmentQuestion(
  assessmentId: string,
  sectionId: string,
  questionId: string,
  input: UpdateAssessmentQuestionInput,
): Promise<AssessmentQuestion> {
  const assessment = await findAssessmentById(assessmentId);
  assertAssessmentEditable(assessment);
  await findAssessmentSectionById(assessmentId, sectionId);

  const existing = await assessmentsRepository.findAssessmentQuestionById(questionId);
  if (!existing || existing.assessmentSectionId !== sectionId) {
    throw new NotFoundError('Assessment question not found');
  }

  const updated = await assessmentsRepository.updateAssessmentQuestion(questionId, input);
  if (!updated) {
    throw new NotFoundError('Assessment question not found');
  }
  return updated;
}

async function deleteAssessmentQuestion(
  assessmentId: string,
  sectionId: string,
  questionId: string,
): Promise<void> {
  const assessment = await findAssessmentById(assessmentId);
  assertAssessmentEditable(assessment);
  await findAssessmentSectionById(assessmentId, sectionId);

  const existing = await assessmentsRepository.findAssessmentQuestionById(questionId);
  if (!existing || existing.assessmentSectionId !== sectionId) {
    throw new NotFoundError('Assessment question not found');
  }

  await assessmentsRepository.deleteAssessmentQuestion(questionId);
}

// --- Assessment section pools (pool selection_mode) ---

async function listAssessmentSectionPools(
  assessmentId: string,
  sectionId: string,
): Promise<AssessmentSectionPool[]> {
  await findAssessmentSectionById(assessmentId, sectionId);
  return assessmentsRepository.listAssessmentSectionPools(sectionId);
}

async function createAssessmentSectionPool(
  assessmentId: string,
  sectionId: string,
  input: CreateAssessmentSectionPoolInput,
): Promise<AssessmentSectionPool> {
  const assessment = await findAssessmentById(assessmentId);
  assertAssessmentEditable(assessment);
  const section = await findAssessmentSectionById(assessmentId, sectionId);
  assertSelectionMode(section, 'pool');

  // Cross-module existence check, same tier as trainersService/
  // organizationService calls above — question-bank owns question_pools.
  const pool = await questionBankService.findQuestionPoolById(input.questionPoolId);
  assertMatchesTestCategory(assessment, pool.type);

  return assessmentsRepository.createAssessmentSectionPool(sectionId, input.questionPoolId);
}

async function deleteAssessmentSectionPool(
  assessmentId: string,
  sectionId: string,
  poolLinkId: string,
): Promise<void> {
  const assessment = await findAssessmentById(assessmentId);
  assertAssessmentEditable(assessment);
  await findAssessmentSectionById(assessmentId, sectionId);

  const existing = await assessmentsRepository.findAssessmentSectionPoolById(poolLinkId);
  if (!existing || existing.assessmentSectionId !== sectionId) {
    throw new NotFoundError('Assessment section pool not found');
  }

  await assessmentsRepository.deleteAssessmentSectionPool(poolLinkId);
}

// item 10 tier 3a — pure passthrough, no existence check on poolId: this
// is a reverse lookup ("who uses this pool"), not a resource fetch, so a
// poolId belonging to no assessment (or not existing at all) legitimately
// just means an empty list, not a 404. See assessments.schema.ts's
// poolUsageParamsSchema comment for what this backs.
async function listAssessmentsUsingPool(poolId: string): Promise<PoolUsageRow[]> {
  return assessmentsRepository.listAssessmentsUsingPool(poolId);
}

// --- Resolve: "get this section's actual questions right now" ---
//
// This is the operation the task asked about explicitly — branches on
// selection_mode rather than being a simple join in both cases. The 'pool'
// branch calls question-bank's resolveQuestionPool (Part 3) per attached
// pool rather than duplicating its query logic here.
//
// Item 5c fix: split out of what used to be the one and only
// resolveSectionQuestions(assessmentId, sectionId) — that function always
// re-fetched the section via findAssessmentSectionById (itself an extra
// findAssessmentById existence-check on top), even when EVERY caller that
// resolves more than one section (findFullAssessment below,
// attempts.service.ts's startAttempt) had already loaded the full section
// list moments earlier via listAssessmentSections. Confirmed live via this
// session's item 5b/5c instrumentation: GET /assessments/:id/full on a
// real 3-pool-section assessment took 2.8s across 31 queries; a large
// fraction of those were this exact redundant per-section re-fetch,
// multiplied by section count. resolveQuestionsForSection takes the
// already-loaded section directly and does none of that re-validation —
// safe, because listAssessmentSections/findAssessmentWithBatches already
// proved the assessment (and therefore every section under it) exists
// before either bulk caller ever reaches this function.
async function resolveQuestionsForSection(
  section: AssessmentSection,
): Promise<ResolvedSectionQuestions> {
  const sectionId = section.id;

  if (section.selectionMode === 'manual') {
    const rows = await assessmentsRepository.listAssessmentQuestionsWithContent(sectionId);
    const questions: ResolvedAssessmentQuestion[] = rows.map((row) => ({
      questionVersionId: row.questionVersionId,
      questionText: row.questionText,
      marks: row.marksOverride ?? row.versionMarks,
      sortOrder: row.sortOrder,
      source: 'manual',
    }));
    return { section, questions };
  }

  // 'pool': a section can have more than one pool attached (assessment_
  // section_pools has no uniqueness constraint limiting a section to one
  // pool, just UNIQUE(section, pool) preventing the same pool twice) — every
  // attached pool is resolved and the results flattened into one list.
  // sortOrder is synthesized from array position: pool-drawn picks have no
  // stored order of their own (each resolve can draw a different random
  // set), unlike assessment_questions' persisted sort_order.
  const poolLinks = await assessmentsRepository.listAssessmentSectionPools(sectionId);
  const poolResolutions = await Promise.all(
    poolLinks.map((link) => questionBankService.resolveQuestionPool(link.questionPoolId)),
  );

  const questions: ResolvedAssessmentQuestion[] = poolResolutions
    .flatMap((resolution) => resolution.criteria.flatMap((criterion) => criterion.selected))
    .map((selected, index) => ({
      questionVersionId: selected.questionVersionId,
      questionText: selected.questionText,
      marks: selected.marks,
      sortOrder: index,
      source: 'pool' as const,
    }));

  return { section, questions, poolResolutions };
}

// Public single-section API (GET /assessments/:id/sections/:sectionId/resolve)
// — the caller here has NOT already loaded the section, so this is exactly
// the original resolveSectionQuestions behavior: validate + fetch, then
// resolve. findFullAssessment/startAttempt below deliberately do NOT call
// this — see resolveQuestionsForSection's own comment for why.
async function resolveSectionQuestions(
  assessmentId: string,
  sectionId: string,
): Promise<ResolvedSectionQuestions> {
  const section = await findAssessmentSectionById(assessmentId, sectionId);
  return resolveQuestionsForSection(section);
}

// --- Full fetch: assessment + sections + resolved questions in one call ---
//
// Pure composition — reuses findAssessmentWithBatches, listAssessmentSections,
// and resolveQuestionsForSection exactly as they already exist (same
// resolution logic GET /sections/:sectionId/resolve uses, one section at a
// time — see that function's own comment on why THIS caller skips the
// redundant re-fetch it would otherwise do).
async function findFullAssessment(id: string): Promise<FullAssessment> {
  const assessment = await findAssessmentWithBatches(id);
  const sections = await listAssessmentSections(id);

  const sectionsWithResolvedQuestions: AssessmentSectionWithResolvedQuestions[] =
    await Promise.all(
      sections.map(async (section) => {
        const { questions, poolResolutions } = await resolveQuestionsForSection(section);
        return { ...section, resolvedQuestions: questions, poolResolutions };
      }),
    );

  return { ...assessment, sections: sectionsWithResolvedQuestions };
}

// --- Approval workflow ---
// Dedicated action endpoints (submit/approve/reject/schedule/publish), not
// folded into updateAssessmentSchema — same call as question-bank Part 3's
// activateQuestionVersion/submitQuestionForApproval precedent: each action
// has a different required permission (assessments.create for submit,
// assessments.approve for approve/reject, assessments.publish for
// schedule/publish) and a side effect (an atomic status change + audit row
// via recordApprovalAction) a generic field PATCH can't cleanly express.
// updateAssessmentSchema already excludes `status` for this exact reason.

async function submitAssessment(
  id: string,
  performedBy: string,
  input: AssessmentApprovalActionInput,
): Promise<Assessment> {
  const assessment = await findAssessmentById(id);
  if (!SUBMITTABLE_STATUSES.includes(assessment.status)) {
    throw new ConflictError(
      `Cannot submit an assessment with status "${assessment.status}" for review — must be "draft"`,
    );
  }

  const { assessment: updated } = await assessmentsRepository.recordApprovalAction(id, {
    status: 'review',
    action: 'submitted',
    performedBy,
    notes: input.notes,
  });
  return updated;
}

async function approveAssessment(
  id: string,
  performedBy: string,
  input: AssessmentApprovalActionInput,
): Promise<Assessment> {
  const assessment = await findAssessmentById(id);
  if (assessment.status !== 'review') {
    throw new ConflictError(
      `Cannot approve an assessment with status "${assessment.status}" — must be "review"`,
    );
  }

  const { assessment: updated } = await assessmentsRepository.recordApprovalAction(id, {
    status: 'approved',
    action: 'approved',
    performedBy,
    notes: input.notes,
  });
  return updated;
}

// Reverts to 'draft' — assessment_status_enum has no dedicated 'rejected'
// value (confirmed directly against schema.sql), so the audit trail (this
// action row) is what records the rejection, not the status column. See
// this file's module comment.
async function rejectAssessment(
  id: string,
  performedBy: string,
  input: AssessmentApprovalActionInput,
): Promise<Assessment> {
  const assessment = await findAssessmentById(id);
  if (assessment.status !== 'review') {
    throw new ConflictError(
      `Cannot reject an assessment with status "${assessment.status}" — must be "review"`,
    );
  }

  const { assessment: updated } = await assessmentsRepository.recordApprovalAction(id, {
    status: 'draft',
    action: 'rejected',
    performedBy,
    notes: input.notes,
  });
  return updated;
}

// Fix for the previously-unreachable schedule state: startAt/endAt used to
// be checked as "must already be set" (via PATCH /assessments/:id), but
// PATCH is blocked by assertAssessmentEditable outside status='draft', and
// this action is only callable once status='approved' — reached via
// submit (draft->review) then approve (review->approved), which can never
// leave the assessment back in 'draft'. There was no reachable sequence of
// calls that could ever set startAt/endAt before scheduling.
//
// Fix: scheduleAssessmentSchema now REQUIRES startAt/endAt in the request
// body, and this function writes them as part of the SAME
// recordApprovalAction transaction that flips status to 'scheduled' —
// committing to a window IS what scheduling means, so this is scheduling's
// own write, not a detour through updateAssessment/assertAssessmentEditable
// (which stays untouched — this fix routes around it rather than
// weakening it).
async function scheduleAssessment(
  id: string,
  performedBy: string,
  input: ScheduleAssessmentInput,
): Promise<Assessment> {
  const assessment = await findAssessmentById(id);
  if (assessment.status !== 'approved') {
    throw new ConflictError(
      `Cannot schedule an assessment with status "${assessment.status}" — must be "approved"`,
    );
  }
  assertValidDateRange(input.startAt, input.endAt);

  const { assessment: updated } = await assessmentsRepository.recordApprovalAction(id, {
    status: 'scheduled',
    action: 'scheduled',
    performedBy,
    notes: input.notes,
    startAt: input.startAt,
    endAt: input.endAt,
  });
  return updated;
}

async function publishAssessment(
  id: string,
  performedBy: string,
  input: AssessmentApprovalActionInput,
): Promise<Assessment> {
  const assessment = await findAssessmentById(id);
  if (assessment.status !== 'scheduled') {
    throw new ConflictError(
      `Cannot publish an assessment with status "${assessment.status}" — must be "scheduled"`,
    );
  }

  // Item 8A's live incident: an assessment reached 'live' with zero
  // assessment_batches rows and was silently invisible to every student
  // (listAvailableAssessments inner-joins assessment_batches — no batch
  // means no possible match, for anyone). Gated HERE specifically, not
  // submitAssessment/scheduleAssessment: assertBatchesEditable (above)
  // deliberately keeps batchIds editable through draft/review/approved/
  // scheduled — an admin scheduling now and attaching batches later, before
  // publishing, is the intended workflow, not something to block early.
  // publishAssessment is the one-way door: BATCH_LOCKED_STATUSES locks
  // batchIds the instant status becomes 'live', so this is the last
  // possible point to catch a batch-less assessment before it can never be
  // fixed by editing batches again. Fetched once here and reused below for
  // the notification fan-out, rather than querying listAssessmentBatchIds
  // twice.
  const batchIds = await assessmentsRepository.listAssessmentBatchIds(id);
  if (batchIds.length === 0) {
    throw new ConflictError(
      'Cannot publish an assessment with no batches assigned — attach at least one batch first.',
    );
  }

  const { assessment: updated } = await assessmentsRepository.recordApprovalAction(id, {
    status: 'live',
    action: 'published',
    performedBy,
    notes: input.notes,
  });

  // Notification trigger (notifications module, item 6) — fired here,
  // AFTER recordApprovalAction has already committed the status flip to
  // 'live'. batchIds reused from the guard above (already fetched via this
  // same module's own repository, listAssessmentBatchIds) rather than
  // queried again — it can't have changed in between (batchIds is now
  // locked the instant status flipped to 'live', two lines above) and
  // reusing it avoids re-deriving through notificationsService, which
  // would create a circular import (notifications.service.ts would
  // otherwise need to import assessmentsService back just to resolve the
  // batches for an assessment it's already been handed) — see
  // notifications.service.ts's module comment for the full reasoning.
  //
  // Deliberately NOT awaited (fire-and-forget, item 3): publishAssessment's
  // return value/throw path below is entirely unaffected by however long
  // resolving recipients, inserting notification rows, and dispatching
  // email actually takes, and by whether any of it fails. A down/
  // misconfigured Resend, or a bug in the notification fan-out, can never
  // turn an already-successful publish into a failed request — the
  // `.catch()` here is a second, defense-in-depth backstop on top of
  // notifyAssessmentPublished's own internal try/catch.
  void notificationsService.notifyAssessmentPublished(updated, batchIds).catch((err) => {
    logger.error({ err, assessmentId: id }, 'notifyAssessmentPublished rejected unexpectedly');
  });

  return updated;
}

async function listAssessmentApprovalHistory(
  assessmentId: string,
  query: ListAssessmentApprovalHistoryQuery,
): Promise<ListQuestionApprovalHistoryResult> {
  await findAssessmentById(assessmentId);
  const { items, total } = await assessmentsRepository.listApprovalHistory(
    assessmentId,
    query.page,
    query.pageSize,
  );
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export const assessmentsService = {
  listAssessments,
  listAvailableAssessments,
  findAssessmentById,
  findAssessmentWithBatches,
  listAssessmentBatches,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  listAssessmentSections,
  findAssessmentSectionById,
  createAssessmentSection,
  updateAssessmentSection,
  deleteAssessmentSection,
  listAssessmentQuestions,
  createAssessmentQuestion,
  updateAssessmentQuestion,
  deleteAssessmentQuestion,
  listAssessmentSectionPools,
  createAssessmentSectionPool,
  deleteAssessmentSectionPool,
  listAssessmentsUsingPool,
  resolveSectionQuestions,
  resolveQuestionsForSection,
  findFullAssessment,
  submitAssessment,
  approveAssessment,
  rejectAssessment,
  scheduleAssessment,
  publishAssessment,
  listAssessmentApprovalHistory,
};
