import { randomUUID } from 'node:crypto';
import type {
  CodingQuestionDetails,
  CodingTestCase,
  PsychometricDetails,
  PsychometricOption,
  Question,
  QuestionCategory,
  QuestionPool,
  QuestionPoolCriteria,
  QuestionTag,
  QuestionTopic,
  QuestionVersion,
} from '../../db/types';
import { organizationService } from '../organization/organization.service';
import { STORAGE_BUCKET, storageService } from '../../integrations/supabase';
import { userHasRole } from '../../rbac/role-assignments';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { questionBankRepository } from './question-bank.repository';
import type {
  ApprovalActionInput,
  CreateCodingQuestionDetailsInput,
  CreateCodingTestCaseInput,
  CreatePsychometricDetailsInput,
  CreatePsychometricOptionInput,
  CreateQuestionCategoryInput,
  CreateQuestionInput,
  CreateQuestionPoolCriteriaInput,
  CreateQuestionPoolInput,
  CreateQuestionTagInput,
  CreateQuestionTopicInput,
  CreateQuestionVersionInput,
  ListQuestionApprovalHistoryQuery,
  ListQuestionCategoriesQuery,
  ListQuestionPoolsQuery,
  ListQuestionTagsQuery,
  ListQuestionTopicsQuery,
  ListQuestionsQuery,
  UpdateCodingQuestionDetailsInput,
  UpdateCodingTestCaseInput,
  UpdatePsychometricDetailsInput,
  UpdatePsychometricOptionInput,
  UpdateQuestionCategoryInput,
  UpdateQuestionInput,
  UpdateQuestionPoolCriteriaInput,
  UpdateQuestionPoolInput,
  UpdateQuestionTagInput,
  UpdateQuestionTopicInput,
} from './question-bank.schema';
import type {
  ListQuestionApprovalHistoryResult,
  ListQuestionCategoriesResult,
  ListQuestionPoolsResult,
  ListQuestionTagsResult,
  ListQuestionTopicsResult,
  ListQuestionsResult,
  ResolvedPoolCriterion,
  ResolvedQuestionPool,
  QuestionVersionWithContent,
  QuestionWithCurrentVersion,
} from './question-bank.types';

// --- Question categories ---

async function listQuestionCategories(
  query: ListQuestionCategoriesQuery,
): Promise<ListQuestionCategoriesResult> {
  const { items, total } = await questionBankRepository.listQuestionCategories({
    parentCategoryId: query.parentCategoryId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findQuestionCategoryById(id: string): Promise<QuestionCategory> {
  const category = await questionBankRepository.findQuestionCategoryById(id);
  if (!category) {
    throw new NotFoundError('Question category not found');
  }
  return category;
}

async function createQuestionCategory(
  input: CreateQuestionCategoryInput,
): Promise<QuestionCategory> {
  if (input.parentCategoryId) {
    await findQuestionCategoryById(input.parentCategoryId);
  }
  return questionBankRepository.createQuestionCategory(input);
}

async function updateQuestionCategory(
  id: string,
  input: UpdateQuestionCategoryInput,
): Promise<QuestionCategory> {
  await findQuestionCategoryById(id);

  if (input.parentCategoryId) {
    if (input.parentCategoryId === id) {
      throw new ValidationError('A category cannot be its own parent');
    }
    await findQuestionCategoryById(input.parentCategoryId);
  }

  const updated = await questionBankRepository.updateQuestionCategory(id, input);
  if (!updated) {
    throw new NotFoundError('Question category not found');
  }
  return updated;
}

async function deleteQuestionCategory(id: string): Promise<void> {
  await findQuestionCategoryById(id);
  await questionBankRepository.deleteQuestionCategory(id);
}

// --- Question topics ---

async function listQuestionTopics(
  query: ListQuestionTopicsQuery,
): Promise<ListQuestionTopicsResult> {
  const { items, total } = await questionBankRepository.listQuestionTopics({
    categoryId: query.categoryId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findQuestionTopicById(id: string): Promise<QuestionTopic> {
  const topic = await questionBankRepository.findQuestionTopicById(id);
  if (!topic) {
    throw new NotFoundError('Question topic not found');
  }
  return topic;
}

async function createQuestionTopic(input: CreateQuestionTopicInput): Promise<QuestionTopic> {
  if (input.categoryId) {
    await findQuestionCategoryById(input.categoryId);
  }
  return questionBankRepository.createQuestionTopic(input);
}

async function updateQuestionTopic(
  id: string,
  input: UpdateQuestionTopicInput,
): Promise<QuestionTopic> {
  await findQuestionTopicById(id);

  if (input.categoryId) {
    await findQuestionCategoryById(input.categoryId);
  }

  const updated = await questionBankRepository.updateQuestionTopic(id, input);
  if (!updated) {
    throw new NotFoundError('Question topic not found');
  }
  return updated;
}

async function deleteQuestionTopic(id: string): Promise<void> {
  await findQuestionTopicById(id);
  await questionBankRepository.deleteQuestionTopic(id);
}

// --- Question tags ---

async function listQuestionTags(query: ListQuestionTagsQuery): Promise<ListQuestionTagsResult> {
  const { items, total } = await questionBankRepository.listQuestionTags({
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findQuestionTagById(id: string): Promise<QuestionTag> {
  const tag = await questionBankRepository.findQuestionTagById(id);
  if (!tag) {
    throw new NotFoundError('Question tag not found');
  }
  return tag;
}

async function createQuestionTag(input: CreateQuestionTagInput): Promise<QuestionTag> {
  // Pre-check for question_tags.name's UNIQUE constraint, same pattern as
  // colleges.code in organization.service.ts.
  const existing = await questionBankRepository.findQuestionTagByName(input.name);
  if (existing) {
    throw new ConflictError('A tag with this name already exists');
  }
  return questionBankRepository.createQuestionTag(input.name);
}

async function updateQuestionTag(
  id: string,
  input: UpdateQuestionTagInput,
): Promise<QuestionTag> {
  const existingTag = await findQuestionTagById(id);

  if (input.name !== existingTag.name) {
    const nameOwner = await questionBankRepository.findQuestionTagByName(input.name);
    if (nameOwner && nameOwner.id !== id) {
      throw new ConflictError('A tag with this name already exists');
    }
  }

  const updated = await questionBankRepository.updateQuestionTag(id, input.name);
  if (!updated) {
    throw new NotFoundError('Question tag not found');
  }
  return updated;
}

async function deleteQuestionTag(id: string): Promise<void> {
  await findQuestionTagById(id);
  await questionBankRepository.deleteQuestionTag(id);
}

// --- Questions / question_versions (the versioned entity) ---
//
// createQuestion = insert questions + insert version #1 (active) + point
// current_version_id at it, atomically (repository-level transaction).
// updateQuestion = plain in-place edit of questions' own metadata columns
// only (category/difficulty/college) — never touches version content.
// Content edits go through createQuestionVersion (always a NEW row, never
// mutates an existing version) followed by an explicit activateQuestionVersion
// call to make it current. See question-bank.repository.ts's module comment
// and this file's module docstring-equivalent in the task response for the
// full reasoning.

// Item 6 (Questions audit fix) — GET /questions is gated by
// QUESTION_BANK_MANAGE (requireAnyPermission(['questions.manage',
// 'questions.manage_global'])), and 'questions.manage' (the "own/college"
// tier) is faculty's grant. Before this fix, `collegeId` was a purely
// optional, client-supplied query filter never derived from the caller's
// identity — a faculty caller who simply omitted it saw the ENTIRE
// platform's question bank, every college's questions, not just their own.
// Same severity as the original assessments gap (fully unscoped, not just
// coarsely scoped), same fix shape: super_admin stays completely unscoped;
// everyone else (faculty, given this route's own permission gate) is
// restricted to the global bank plus their own college(s)' questions.
//
// Questions are COLLEGE-scoped (questions.college_id), not batch-scoped —
// unlike assessments, there's no assessment_batches-equivalent join
// target. So "faculty's relevant colleges" has to be DERIVED from batch
// assignment: organizationService.listBatchAssignmentsForTrainers already
// resolves each assigned batch down to its owning college (batch_trainers
// -> batches -> training_programs -> colleges, the same join
// TrainerBatchAssignmentRow always carried), so this reuses that exact
// call (same as assessments.service.ts's resolveAssessmentListBatchScope)
// and just extracts .collegeId instead of .batchId, deduplicated — a
// trainer assigned to batches across N colleges is scoped to all N, union,
// not just their first/primary one.
async function resolveQuestionListCollegeScope(userId: string): Promise<string[] | undefined> {
  const isSuperAdmin = await userHasRole(userId, 'super_admin');
  if (isSuperAdmin) {
    return undefined;
  }

  const trainerBatchAssignments = await organizationService.listBatchAssignmentsForTrainers([
    userId,
  ]);
  return [...new Set(trainerBatchAssignments.map((assignment) => assignment.collegeId))];
}

async function listQuestions(
  userId: string,
  query: ListQuestionsQuery,
): Promise<ListQuestionsResult> {
  const collegeIds = await resolveQuestionListCollegeScope(userId);

  const { items, total } = await questionBankRepository.listQuestions({
    categoryId: query.categoryId,
    type: query.type,
    difficulty: query.difficulty,
    collegeId: query.collegeId,
    status: query.status,
    search: query.search,
    collegeIds,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findQuestionById(id: string): Promise<Question> {
  const question = await questionBankRepository.findQuestionById(id);
  if (!question) {
    throw new NotFoundError('Question not found');
  }
  return question;
}

async function findQuestionWithCurrentVersion(id: string): Promise<QuestionWithCurrentVersion> {
  const question = await findQuestionById(id);
  const currentVersion = question.currentVersionId
    ? ((await questionBankRepository.findQuestionVersionContentById(
        question.currentVersionId,
      )) ?? null)
    : null;
  return { ...question, currentVersion };
}

// Enforces the invariant nothing in the DB schema itself guards: a
// codingDetails/testCases payload only makes sense for type === 'coding',
// and psychometricDetails/psychometricOptions only for type ===
// 'psychometric'. Shared by createQuestion (type comes from the input
// itself) and createQuestionVersion (type comes from the already-created
// parent question, since type isn't settable per-version).
function assertTypeSpecificPayloadsMatch(
  type: 'mcq' | 'coding' | 'psychometric',
  payload: {
    codingDetails?: unknown;
    testCases?: unknown[];
    psychometricDetails?: unknown;
    psychometricOptions?: unknown[];
  },
): void {
  const hasCodingPayload =
    payload.codingDetails !== undefined || (payload.testCases?.length ?? 0) > 0;
  const hasPsychometricPayload =
    payload.psychometricDetails !== undefined || (payload.psychometricOptions?.length ?? 0) > 0;

  if (hasCodingPayload && type !== 'coding') {
    throw new ValidationError('codingDetails/testCases can only be provided for type "coding"');
  }
  if (hasPsychometricPayload && type !== 'psychometric') {
    throw new ValidationError(
      'psychometricDetails/psychometricOptions can only be provided for type "psychometric"',
    );
  }
}

async function createQuestion(
  input: CreateQuestionInput,
  createdBy: string,
): Promise<QuestionWithCurrentVersion> {
  if (input.categoryId) {
    await findQuestionCategoryById(input.categoryId);
  }
  // NULL collegeId = global bank by design (schema.sql's own comment on the
  // column) — only validate when a specific college is actually named.
  // Cross-module call, per CLAUDE.md's boundary rule (service-to-service,
  // never another module's repository).
  if (input.collegeId) {
    await organizationService.findCollegeById(input.collegeId);
  }
  if (input.topicIds && input.topicIds.length > 0) {
    await Promise.all(input.topicIds.map((topicId) => findQuestionTopicById(topicId)));
  }
  if (input.tagIds && input.tagIds.length > 0) {
    await Promise.all(input.tagIds.map((tagId) => findQuestionTagById(tagId)));
  }
  assertTypeSpecificPayloadsMatch(input.type, input);

  const { question, version } = await questionBankRepository.createQuestionWithVersion({
    categoryId: input.categoryId,
    type: input.type,
    difficulty: input.difficulty,
    collegeId: input.collegeId,
    questionText: input.questionText,
    marks: input.marks,
    options: input.options,
    images: input.images,
    codingDetails: input.codingDetails,
    testCases: input.testCases,
    psychometricDetails: input.psychometricDetails,
    psychometricOptions: input.psychometricOptions,
    topicIds: input.topicIds,
    tagIds: input.tagIds,
    createdBy,
  });

  return { ...question, currentVersion: version };
}

async function updateQuestion(
  id: string,
  input: UpdateQuestionInput,
  updatedBy: string,
): Promise<Question> {
  await findQuestionById(id);

  if (input.categoryId) {
    await findQuestionCategoryById(input.categoryId);
  }
  if (input.collegeId) {
    await organizationService.findCollegeById(input.collegeId);
  }

  const updated = await questionBankRepository.updateQuestion(id, { ...input, updatedBy });
  if (!updated) {
    throw new NotFoundError('Question not found');
  }
  return updated;
}

async function deleteQuestion(id: string): Promise<void> {
  await findQuestionById(id);
  await questionBankRepository.deleteQuestion(id);
}

async function listQuestionVersions(questionId: string): Promise<QuestionVersion[]> {
  await findQuestionById(questionId);
  return questionBankRepository.listQuestionVersions(questionId);
}

async function findQuestionVersionById(
  questionId: string,
  versionId: string,
): Promise<QuestionVersionWithContent> {
  await findQuestionById(questionId);
  const version = await questionBankRepository.findQuestionVersionByQuestionAndId(
    questionId,
    versionId,
  );
  if (!version) {
    throw new NotFoundError('Question version not found');
  }
  return version;
}

async function createQuestionVersion(
  questionId: string,
  input: CreateQuestionVersionInput,
  createdBy: string,
): Promise<QuestionVersionWithContent> {
  const question = await findQuestionById(questionId);
  assertTypeSpecificPayloadsMatch(question.type, input);
  return questionBankRepository.createQuestionVersion(questionId, { ...input, createdBy });
}

// Deliberately does not set approved_by/approved_at — those belong to the
// not-yet-built approval workflow (Part 2/3, question_approval_history).
// Activation here is a mechanical "make this the current version" op, not
// an approval decision.
async function activateQuestionVersion(questionId: string, versionId: string): Promise<Question> {
  await findQuestionById(questionId);

  const version = await questionBankRepository.findQuestionVersionByQuestionAndId(
    questionId,
    versionId,
  );
  if (!version) {
    throw new NotFoundError('Question version not found');
  }
  if (version.isActiveVersion) {
    throw new ConflictError('This version is already active');
  }

  const updated = await questionBankRepository.activateQuestionVersion(questionId, versionId);
  if (!updated) {
    throw new NotFoundError('Question not found');
  }
  return updated;
}

// --- Type-specific detail tables (Part 2) ---
//
// coding_question_details/coding_test_cases/psychometric_details/
// psychometric_options are all version-scoped, so every operation below
// first resolves {question, version} together (getQuestionAndVersion) —
// this also 404s a version that doesn't belong to the given question,
// same discipline as findQuestionVersionById above.
//
// Mutations (create/update/delete) additionally reject once the target
// version is active (assertVersionMutable): question_versions rows were
// already established in Part 1 as immutable once created, specifically
// because a future assessments module will freeze a specific
// question_version_id per attempt. The same hazard applies to a version's
// type-specific children — silently changing an active version's test
// cases or coding constraints in place could retroactively alter content
// already in use. Reads are unrestricted; edits after activation require
// creating a new version instead (createQuestionVersion).

async function getQuestionAndVersion(
  questionId: string,
  versionId: string,
): Promise<{ question: Question; version: QuestionVersionWithContent }> {
  const question = await findQuestionById(questionId);
  const version = await questionBankRepository.findQuestionVersionByQuestionAndId(
    questionId,
    versionId,
  );
  if (!version) {
    throw new NotFoundError('Question version not found');
  }
  return { question, version };
}

function assertVersionMutable(version: QuestionVersionWithContent): void {
  if (version.isActiveVersion) {
    throw new ConflictError(
      'Cannot modify detail content on an active version — create a new version instead',
    );
  }
}

// --- Coding question details (1:1 per version) ---

async function findCodingQuestionDetails(
  questionId: string,
  versionId: string,
): Promise<CodingQuestionDetails> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  const details = await questionBankRepository.findCodingQuestionDetailsByVersionId(version.id);
  if (!details) {
    throw new NotFoundError('Coding question details not found for this version');
  }
  return details;
}

async function createCodingQuestionDetails(
  questionId: string,
  versionId: string,
  input: CreateCodingQuestionDetailsInput,
): Promise<CodingQuestionDetails> {
  const { question, version } = await getQuestionAndVersion(questionId, versionId);
  if (question.type !== 'coding') {
    throw new ValidationError('Coding details can only be added to a "coding" type question');
  }
  assertVersionMutable(version);

  const existing = await questionBankRepository.findCodingQuestionDetailsByVersionId(version.id);
  if (existing) {
    throw new ConflictError('Coding details already exist for this version');
  }

  return questionBankRepository.createCodingQuestionDetails(version.id, input);
}

async function updateCodingQuestionDetails(
  questionId: string,
  versionId: string,
  input: UpdateCodingQuestionDetailsInput,
): Promise<CodingQuestionDetails> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  assertVersionMutable(version);

  const updated = await questionBankRepository.updateCodingQuestionDetails(version.id, input);
  if (!updated) {
    throw new NotFoundError('Coding question details not found for this version');
  }
  return updated;
}

async function deleteCodingQuestionDetails(questionId: string, versionId: string): Promise<void> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  assertVersionMutable(version);

  const deleted = await questionBankRepository.deleteCodingQuestionDetails(version.id);
  if (!deleted) {
    throw new NotFoundError('Coding question details not found for this version');
  }
}

// --- Coding test cases (1:many per version) ---

async function listCodingTestCases(
  questionId: string,
  versionId: string,
): Promise<CodingTestCase[]> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  return questionBankRepository.listCodingTestCases(version.id);
}

async function createCodingTestCase(
  questionId: string,
  versionId: string,
  input: CreateCodingTestCaseInput,
): Promise<CodingTestCase> {
  const { question, version } = await getQuestionAndVersion(questionId, versionId);
  if (question.type !== 'coding') {
    throw new ValidationError('Test cases can only be added to a "coding" type question');
  }
  assertVersionMutable(version);

  return questionBankRepository.createCodingTestCase(version.id, input);
}

async function updateCodingTestCase(
  questionId: string,
  versionId: string,
  testCaseId: string,
  input: UpdateCodingTestCaseInput,
): Promise<CodingTestCase> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  assertVersionMutable(version);

  const existing = await questionBankRepository.findCodingTestCaseById(testCaseId);
  if (!existing || existing.questionVersionId !== version.id) {
    throw new NotFoundError('Coding test case not found');
  }

  const updated = await questionBankRepository.updateCodingTestCase(testCaseId, input);
  if (!updated) {
    throw new NotFoundError('Coding test case not found');
  }
  return updated;
}

async function deleteCodingTestCase(
  questionId: string,
  versionId: string,
  testCaseId: string,
): Promise<void> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  assertVersionMutable(version);

  const existing = await questionBankRepository.findCodingTestCaseById(testCaseId);
  if (!existing || existing.questionVersionId !== version.id) {
    throw new NotFoundError('Coding test case not found');
  }

  await questionBankRepository.deleteCodingTestCase(testCaseId);
}

// --- Psychometric details (1:1 per version) ---

async function findPsychometricDetails(
  questionId: string,
  versionId: string,
): Promise<PsychometricDetails> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  const details = await questionBankRepository.findPsychometricDetailsByVersionId(version.id);
  if (!details) {
    throw new NotFoundError('Psychometric details not found for this version');
  }
  return details;
}

async function createPsychometricDetails(
  questionId: string,
  versionId: string,
  input: CreatePsychometricDetailsInput,
): Promise<PsychometricDetails> {
  const { question, version } = await getQuestionAndVersion(questionId, versionId);
  if (question.type !== 'psychometric') {
    throw new ValidationError(
      'Psychometric details can only be added to a "psychometric" type question',
    );
  }
  assertVersionMutable(version);

  const existing = await questionBankRepository.findPsychometricDetailsByVersionId(version.id);
  if (existing) {
    throw new ConflictError('Psychometric details already exist for this version');
  }

  return questionBankRepository.createPsychometricDetails(version.id, input);
}

async function updatePsychometricDetails(
  questionId: string,
  versionId: string,
  input: UpdatePsychometricDetailsInput,
): Promise<PsychometricDetails> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  assertVersionMutable(version);

  const updated = await questionBankRepository.updatePsychometricDetails(version.id, input);
  if (!updated) {
    throw new NotFoundError('Psychometric details not found for this version');
  }
  return updated;
}

async function deletePsychometricDetails(questionId: string, versionId: string): Promise<void> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  assertVersionMutable(version);

  const deleted = await questionBankRepository.deletePsychometricDetails(version.id);
  if (!deleted) {
    throw new NotFoundError('Psychometric details not found for this version');
  }
}

// --- Psychometric options (1:many per version) ---

async function listPsychometricOptions(
  questionId: string,
  versionId: string,
): Promise<PsychometricOption[]> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  return questionBankRepository.listPsychometricOptions(version.id);
}

async function createPsychometricOption(
  questionId: string,
  versionId: string,
  input: CreatePsychometricOptionInput,
): Promise<PsychometricOption> {
  const { question, version } = await getQuestionAndVersion(questionId, versionId);
  if (question.type !== 'psychometric') {
    throw new ValidationError(
      'Psychometric options can only be added to a "psychometric" type question',
    );
  }
  assertVersionMutable(version);

  return questionBankRepository.createPsychometricOption(version.id, input);
}

async function updatePsychometricOption(
  questionId: string,
  versionId: string,
  optionId: string,
  input: UpdatePsychometricOptionInput,
): Promise<PsychometricOption> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  assertVersionMutable(version);

  const existing = await questionBankRepository.findPsychometricOptionById(optionId);
  if (!existing || existing.questionVersionId !== version.id) {
    throw new NotFoundError('Psychometric option not found');
  }

  const updated = await questionBankRepository.updatePsychometricOption(optionId, input);
  if (!updated) {
    throw new NotFoundError('Psychometric option not found');
  }
  return updated;
}

async function deletePsychometricOption(
  questionId: string,
  versionId: string,
  optionId: string,
): Promise<void> {
  const { version } = await getQuestionAndVersion(questionId, versionId);
  assertVersionMutable(version);

  const existing = await questionBankRepository.findPsychometricOptionById(optionId);
  if (!existing || existing.questionVersionId !== version.id) {
    throw new NotFoundError('Psychometric option not found');
  }

  await questionBankRepository.deletePsychometricOption(optionId);
}

// --- Approval workflow (Part 3) ---
//
// question_approval_action_enum has three values (submitted/approved/
// rejected) and nothing in schema.sql enforces which questions.status a
// question must be in for a given action to apply — no CHECK constraint, no
// trigger (confirmed by reading schema.sql directly). The state machine
// below is therefore entirely a service-layer invariant, the same layering
// this file already uses for version-mutability and type-match rules.
//
// draft --submit--> pending_review --approve--> approved
//                                  \-reject---> rejected --submit--> pending_review
//
// 'archived' is a separate lifecycle state (schema.sql's question_status_enum
// has it, but no archive/unarchive action exists anywhere in this codebase
// yet) — deliberately left untouched by this workflow rather than invented
// here.
const SUBMITTABLE_STATUSES: Question['status'][] = ['draft', 'rejected'];

// Recording an approval/rejection is its own dedicated endpoint (POST
// /questions/:id/approve, /reject, and /submit), not folded into the
// existing PATCH /questions/:id update flow. Same call this codebase
// already made for activateQuestionVersion vs a generic version PATCH:
// a status transition is a workflow ACTION with a side effect (an
// append-only history row via recordApprovalAction) and its own permission
// requirement (questions.approve, distinct from questions.manage) — a
// single generic "PATCH status" field couldn't cleanly carry either of
// those per-action requirements. updateQuestionSchema already explicitly
// excludes `status` for this exact reason (see question-bank.schema.ts).

async function submitQuestionForApproval(
  id: string,
  performedBy: string,
  input: ApprovalActionInput,
): Promise<Question> {
  const question = await findQuestionById(id);
  if (!SUBMITTABLE_STATUSES.includes(question.status)) {
    throw new ConflictError(
      `Cannot submit a question with status "${question.status}" for approval`,
    );
  }

  const { question: updated } = await questionBankRepository.recordApprovalAction(id, {
    status: 'pending_review',
    action: 'submitted',
    questionVersionId: question.currentVersionId,
    performedBy,
    notes: input.notes,
  });
  return updated;
}

async function approveQuestion(
  id: string,
  performedBy: string,
  input: ApprovalActionInput,
): Promise<Question> {
  const question = await findQuestionById(id);
  if (question.status !== 'pending_review') {
    throw new ConflictError(
      `Cannot approve a question with status "${question.status}" — must be "pending_review"`,
    );
  }

  const { question: updated } = await questionBankRepository.recordApprovalAction(id, {
    status: 'approved',
    action: 'approved',
    questionVersionId: question.currentVersionId,
    performedBy,
    notes: input.notes,
  });
  return updated;
}

async function rejectQuestion(
  id: string,
  performedBy: string,
  input: ApprovalActionInput,
): Promise<Question> {
  const question = await findQuestionById(id);
  if (question.status !== 'pending_review') {
    throw new ConflictError(
      `Cannot reject a question with status "${question.status}" — must be "pending_review"`,
    );
  }

  const { question: updated } = await questionBankRepository.recordApprovalAction(id, {
    status: 'rejected',
    action: 'rejected',
    questionVersionId: question.currentVersionId,
    performedBy,
    notes: input.notes,
  });
  return updated;
}

async function listQuestionApprovalHistory(
  questionId: string,
  query: ListQuestionApprovalHistoryQuery,
): Promise<ListQuestionApprovalHistoryResult> {
  await findQuestionById(questionId);
  const { items, total } = await questionBankRepository.listApprovalHistory(
    questionId,
    query.page,
    query.pageSize,
  );
  return { items, total, page: query.page, pageSize: query.pageSize };
}

// --- Question pools (Part 3) ---
//
// My read on the domain (per the task's request to state it before writing
// query logic): a question_pool is a reusable, criteria-filtered bucket of
// approved questions, scoped to exactly one question type and optionally
// one category and/or one college (NULL college_id = global reusable pool,
// same convention as questions.college_id). An assessment section using
// pool-based selection (assessment_sections.selection_mode = 'pool', via
// assessment_section_pools — out of scope, assessments module) draws its
// randomized question set from a pool at that point. Each
// question_pool_criteria row is one independently-resolved "slice" of the
// pool's requirement: count_required questions matching the pool's
// type/category plus this row's own difficulty (required) and, optionally,
// a single topic and/or a tag filter. A pool typically holds several
// criteria rows to build a mix (e.g. 5 easy + 10 medium + 5 hard). See
// resolveQuestionPool below for exactly how each slice is resolved.

async function listQuestionPools(query: ListQuestionPoolsQuery): Promise<ListQuestionPoolsResult> {
  const { items, total } = await questionBankRepository.listQuestionPools({
    collegeId: query.collegeId,
    categoryId: query.categoryId,
    type: query.type,
    search: query.search,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findQuestionPoolById(id: string): Promise<QuestionPool> {
  const pool = await questionBankRepository.findQuestionPoolById(id);
  if (!pool) {
    throw new NotFoundError('Question pool not found');
  }
  return pool;
}

async function createQuestionPool(
  input: CreateQuestionPoolInput,
  createdBy: string,
): Promise<QuestionPool> {
  if (input.collegeId) {
    await organizationService.findCollegeById(input.collegeId);
  }
  if (input.categoryId) {
    await findQuestionCategoryById(input.categoryId);
  }
  return questionBankRepository.createQuestionPool({ ...input, createdBy });
}

async function updateQuestionPool(
  id: string,
  input: UpdateQuestionPoolInput,
  updatedBy: string,
): Promise<QuestionPool> {
  await findQuestionPoolById(id);

  if (input.collegeId) {
    await organizationService.findCollegeById(input.collegeId);
  }
  if (input.categoryId) {
    await findQuestionCategoryById(input.categoryId);
  }

  const updated = await questionBankRepository.updateQuestionPool(id, { ...input, updatedBy });
  if (!updated) {
    throw new NotFoundError('Question pool not found');
  }
  return updated;
}

async function deleteQuestionPool(id: string): Promise<void> {
  await findQuestionPoolById(id);
  await questionBankRepository.deleteQuestionPool(id);
}

// --- Question pool criteria (Part 3) ---

async function listQuestionPoolCriteria(questionPoolId: string): Promise<QuestionPoolCriteria[]> {
  await findQuestionPoolById(questionPoolId);
  return questionBankRepository.listQuestionPoolCriteria(questionPoolId);
}

async function getQuestionPoolCriteria(
  questionPoolId: string,
  criteriaId: string,
): Promise<QuestionPoolCriteria> {
  await findQuestionPoolById(questionPoolId);
  const criteria = await questionBankRepository.findQuestionPoolCriteriaById(criteriaId);
  if (!criteria || criteria.questionPoolId !== questionPoolId) {
    throw new NotFoundError('Question pool criteria not found');
  }
  return criteria;
}

async function createQuestionPoolCriteria(
  questionPoolId: string,
  input: CreateQuestionPoolCriteriaInput,
): Promise<QuestionPoolCriteria> {
  await findQuestionPoolById(questionPoolId);
  if (input.topicId) {
    await findQuestionTopicById(input.topicId);
  }
  if (input.tagFilter && input.tagFilter.length > 0) {
    await Promise.all(input.tagFilter.map((tagId) => findQuestionTagById(tagId)));
  }
  return questionBankRepository.createQuestionPoolCriteria(questionPoolId, input);
}

async function updateQuestionPoolCriteria(
  questionPoolId: string,
  criteriaId: string,
  input: UpdateQuestionPoolCriteriaInput,
): Promise<QuestionPoolCriteria> {
  await getQuestionPoolCriteria(questionPoolId, criteriaId);

  if (input.topicId) {
    await findQuestionTopicById(input.topicId);
  }
  if (input.tagFilter && input.tagFilter.length > 0) {
    await Promise.all(input.tagFilter.map((tagId) => findQuestionTagById(tagId)));
  }

  const updated = await questionBankRepository.updateQuestionPoolCriteria(criteriaId, input);
  if (!updated) {
    throw new NotFoundError('Question pool criteria not found');
  }
  return updated;
}

async function deleteQuestionPoolCriteria(
  questionPoolId: string,
  criteriaId: string,
): Promise<void> {
  await getQuestionPoolCriteria(questionPoolId, criteriaId);
  await questionBankRepository.deleteQuestionPoolCriteria(criteriaId);
}

// Cross-module read for assessments.service.ts (Part 4) — assessment_questions.
// question_version_id references question_versions(id) directly (no separate
// question_id column on that junction table in schema.sql), so the manual-
// selection path needs a version looked up by its own id alone, unlike
// findQuestionVersionById(questionId, versionId) above which requires
// already knowing the parent question. Repository-level
// findQuestionVersionContentById already does exactly this; this is just
// the missing service-level wrapper (NotFoundError instead of undefined),
// same discipline as every other lookup in this file — added here rather
// than in assessments' own repository per CLAUDE.md's boundary rule (a
// module may call another module's SERVICE, never its repository).
async function findQuestionVersionContentById(versionId: string): Promise<QuestionVersionWithContent> {
  const version = await questionBankRepository.findQuestionVersionContentById(versionId);
  if (!version) {
    throw new NotFoundError('Question version not found');
  }
  return version;
}

// --- Pool resolution (Part 3) ---
//
// Runs every criteria row's filters against real, currently-approved
// questions and reports what it would draw right now — the operation
// assessments will actually depend on once assessment_section_pools exists,
// and the exact function attempts.startAttempt calls to freeze a pool
// section's questions (assessments.service.ts's resolveSectionQuestions).
// A pool is "fully satisfied" only when every criterion drew as many as it
// required, which is the signal a curator needs before letting an
// assessment section point at this pool.
//
// Cross-criterion dedup fix: criteria used to be resolved fully in
// parallel (Promise.all), each with its own independent random draw and no
// awareness of what a SIBLING criterion in the same pool might also be
// drawing. When two criteria have overlapping eligible questions (e.g.
// both target difficulty='easy'), the same question_version_id could be
// selected by both — harmless for this read-only display, but fatal once
// attempts.startAttempt flattens the result and inserts it into
// attempt_question_selections, which has UNIQUE(attempt_id,
// question_version_id) — a live 500/constraint violation. Fixed here, in
// the shared function, not patched around in attempts: criteria are now
// resolved SEQUENTIALLY (a for..of loop, not Promise.all), threading a
// running Set of every questionId already drawn by an earlier criterion
// into resolveCriterionQuestions' new excludeQuestionIds parameter, so a
// later criterion's random draw can never re-select a question an earlier
// criterion in this same call already took. This does trade away
// criteria-level query parallelism, but dedup is fundamentally
// incompatible with resolving criteria independently/concurrently — the
// only way a later criterion can know what to exclude is to run after the
// earlier ones. Pools have a handful of criteria at most, so the
// sequential latency cost is minor.
//
// eligibleTotal stays PRE-dedup (unaffected by this fix — see
// question-bank.repository.ts's resolveCriterionQuestions, which counts
// against `where` alone, never `selectionWhere`). Its documented purpose
// (question-bank.types.ts's ResolvedPoolCriterion) is "how many approved
// questions satisfy THIS criterion's OWN filters, regardless of
// count_required" — a stable measure of how well-supplied a criterion is
// in isolation. Making it post-dedup would mean its value depends on
// resolution order and on what a sibling criterion's random draw happened
// to take in this one particular call — the same pool, unchanged, could
// report a different eligibleTotal from one resolve call to the next with
// nothing about the underlying content having changed. That would defeat
// its purpose as a curator-facing "is this criterion well-supplied" signal.
// `selected`/`totalSelected`/`isFullySatisfied`, by contrast, DO need to
// reflect the post-dedup reality, because they describe the actual draw —
// if overlap with an earlier criterion leaves fewer eligible options than
// count_required, selected.length legitimately comes up short and
// isFullySatisfied correctly reports false, which is exactly the accurate
// shortage signal a curator/attempt-starter needs.
async function resolveQuestionPool(questionPoolId: string): Promise<ResolvedQuestionPool> {
  const pool = await findQuestionPoolById(questionPoolId);
  const criteria = await questionBankRepository.listQuestionPoolCriteria(questionPoolId);

  const resolved: ResolvedPoolCriterion[] = [];
  const selectedQuestionIds = new Set<string>();

  for (const criterion of criteria) {
    const { eligibleTotal, selected } = await questionBankRepository.resolveCriterionQuestions(
      pool,
      criterion,
      Array.from(selectedQuestionIds),
    );
    for (const question of selected) {
      selectedQuestionIds.add(question.questionId);
    }
    resolved.push({ ...criterion, eligibleTotal, selected });
  }

  const totalRequired = criteria.reduce((sum, criterion) => sum + criterion.countRequired, 0);
  const totalSelected = resolved.reduce((sum, criterion) => sum + criterion.selected.length, 0);

  return {
    pool,
    criteria: resolved,
    totalRequired,
    totalSelected,
    isFullySatisfied: resolved.every(
      (criterion) => criterion.selected.length >= criterion.countRequired,
    ),
  };
}

// --- Question/option images (item 2) ---
//
// Not tied to an existing question/version id (unlike users.service.ts's
// uploadAvatar, which writes STORAGE_BUCKET.AVATARS at a deterministic
// `${userId}/avatar` path and immediately persists the URL onto that user's
// row) — a question is created with its content (including options/images)
// in ONE atomic call (createQuestionWithVersion), so there is no question/
// version id yet at the moment a trainer picks an image while filling out
// the create form. question_options.option_image_url and question_images.
// image_url are both already plain TEXT columns with no FK to a "pending
// upload" table (confirmed against db/schema/question-bank.schema.ts), so
// this mirrors that: upload straight into STORAGE_BUCKET.QUESTION_IMAGES
// under a per-uploader path and hand back the public URL, which the
// frontend then includes as a plain imageUrl string in the create/version
// payload exactly like any other field — no schema change, no move/staging
// step needed. Uploads that get discarded before the question is ever
// submitted become orphaned storage objects; sweeping those up is exactly
// what jobs/temp-storage-purge.job.ts is reserved for (currently a stub —
// out of scope here, this only adds the upload path it would eventually
// clean up after).
async function uploadQuestionImage(
  file: Buffer,
  contentType: string,
  uploadedBy: string,
): Promise<string> {
  const extension = contentType.split('/')[1] ?? 'bin';
  const path = `${uploadedBy}/${randomUUID()}.${extension}`;

  await storageService.upload(STORAGE_BUCKET.QUESTION_IMAGES, path, file, contentType);

  const { url } = storageService.getPublicUrl(STORAGE_BUCKET.QUESTION_IMAGES, path);
  return url;
}

export const questionBankService = {
  listQuestionCategories,
  findQuestionCategoryById,
  createQuestionCategory,
  updateQuestionCategory,
  deleteQuestionCategory,
  listQuestionTopics,
  findQuestionTopicById,
  createQuestionTopic,
  updateQuestionTopic,
  deleteQuestionTopic,
  listQuestionTags,
  findQuestionTagById,
  createQuestionTag,
  updateQuestionTag,
  deleteQuestionTag,
  listQuestions,
  findQuestionById,
  findQuestionWithCurrentVersion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  listQuestionVersions,
  findQuestionVersionById,
  findQuestionVersionContentById,
  createQuestionVersion,
  activateQuestionVersion,
  findCodingQuestionDetails,
  createCodingQuestionDetails,
  updateCodingQuestionDetails,
  deleteCodingQuestionDetails,
  listCodingTestCases,
  createCodingTestCase,
  updateCodingTestCase,
  deleteCodingTestCase,
  findPsychometricDetails,
  createPsychometricDetails,
  updatePsychometricDetails,
  deletePsychometricDetails,
  listPsychometricOptions,
  createPsychometricOption,
  updatePsychometricOption,
  deletePsychometricOption,
  submitQuestionForApproval,
  approveQuestion,
  rejectQuestion,
  listQuestionApprovalHistory,
  listQuestionPools,
  findQuestionPoolById,
  createQuestionPool,
  updateQuestionPool,
  deleteQuestionPool,
  listQuestionPoolCriteria,
  getQuestionPoolCriteria,
  createQuestionPoolCriteria,
  updateQuestionPoolCriteria,
  deleteQuestionPoolCriteria,
  resolveQuestionPool,
  uploadQuestionImage,
};
