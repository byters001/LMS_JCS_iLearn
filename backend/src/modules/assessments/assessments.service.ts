import type {
  Assessment,
  AssessmentQuestion,
  AssessmentSection,
  AssessmentSectionPool,
} from '../../db/types';
import { organizationService } from '../organization/organization.service';
import { questionBankService } from '../question-bank/question-bank.service';
import { trainersService } from '../trainers/trainers.service';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { assessmentsRepository } from './assessments.repository';
import type {
  AssessmentApprovalActionInput,
  CreateAssessmentInput,
  CreateAssessmentQuestionInput,
  CreateAssessmentSectionInput,
  CreateAssessmentSectionPoolInput,
  ListAssessmentApprovalHistoryQuery,
  ListAssessmentsQuery,
  UpdateAssessmentInput,
  UpdateAssessmentQuestionInput,
  UpdateAssessmentSectionInput,
} from './assessments.schema';
import type {
  AssessmentWithBatches,
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

async function listAssessments(query: ListAssessmentsQuery): Promise<ListAssessmentsResult> {
  const { items, total } = await assessmentsRepository.listAssessments({
    trainingSessionId: query.trainingSessionId,
    status: query.status,
    testCategory: query.testCategory,
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
  // already 404s if missing, nothing further to layer on top.
  await trainersService.findTrainingSessionById(input.trainingSessionId);

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
  assertAssessmentEditable(existing);

  if (input.batchIds) {
    await Promise.all(input.batchIds.map((batchId) => organizationService.findBatchById(batchId)));
  }

  const nextStartAt = input.startAt !== undefined ? input.startAt : existing.startAt;
  const nextEndAt = input.endAt !== undefined ? input.endAt : existing.endAt;
  assertValidDateRange(nextStartAt, nextEndAt);

  const { batchIds, ...rest } = input;
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

// --- Resolve: "get this section's actual questions right now" ---
//
// This is the operation the task asked about explicitly — branches on
// selection_mode rather than being a simple join in both cases. The 'pool'
// branch calls question-bank's resolveQuestionPool (Part 3) per attached
// pool rather than duplicating its query logic here.
async function resolveSectionQuestions(
  assessmentId: string,
  sectionId: string,
): Promise<ResolvedSectionQuestions> {
  const section = await findAssessmentSectionById(assessmentId, sectionId);

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

async function scheduleAssessment(
  id: string,
  performedBy: string,
  input: AssessmentApprovalActionInput,
): Promise<Assessment> {
  const assessment = await findAssessmentById(id);
  if (assessment.status !== 'approved') {
    throw new ConflictError(
      `Cannot schedule an assessment with status "${assessment.status}" — must be "approved"`,
    );
  }
  // Business rule the DB doesn't enforce: you can't schedule a test with no
  // window to sit it in. start_at/end_at are both nullable columns in
  // schema.sql (open-ended by default), but scheduling specifically means
  // committing to a window.
  if (!assessment.startAt || !assessment.endAt) {
    throw new ValidationError('startAt and endAt must both be set before scheduling');
  }

  const { assessment: updated } = await assessmentsRepository.recordApprovalAction(id, {
    status: 'scheduled',
    action: 'scheduled',
    performedBy,
    notes: input.notes,
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

  const { assessment: updated } = await assessmentsRepository.recordApprovalAction(id, {
    status: 'live',
    action: 'published',
    performedBy,
    notes: input.notes,
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
  resolveSectionQuestions,
  submitAssessment,
  approveAssessment,
  rejectAssessment,
  scheduleAssessment,
  publishAssessment,
  listAssessmentApprovalHistory,
};
