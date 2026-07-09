import type {
  CodingQuestionDetails,
  CodingTestCase,
  PsychometricDetails,
  PsychometricOption,
  Question,
  QuestionCategory,
  QuestionTag,
  QuestionTopic,
  QuestionVersion,
} from '../../db/types';
import { organizationService } from '../organization/organization.service';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { questionBankRepository } from './question-bank.repository';
import type {
  CreateCodingQuestionDetailsInput,
  CreateCodingTestCaseInput,
  CreatePsychometricDetailsInput,
  CreatePsychometricOptionInput,
  CreateQuestionCategoryInput,
  CreateQuestionInput,
  CreateQuestionTagInput,
  CreateQuestionTopicInput,
  CreateQuestionVersionInput,
  ListQuestionCategoriesQuery,
  ListQuestionTagsQuery,
  ListQuestionTopicsQuery,
  ListQuestionsQuery,
  UpdateCodingQuestionDetailsInput,
  UpdateCodingTestCaseInput,
  UpdatePsychometricDetailsInput,
  UpdatePsychometricOptionInput,
  UpdateQuestionCategoryInput,
  UpdateQuestionInput,
  UpdateQuestionTagInput,
  UpdateQuestionTopicInput,
} from './question-bank.schema';
import type {
  ListQuestionCategoriesResult,
  ListQuestionTagsResult,
  ListQuestionTopicsResult,
  ListQuestionsResult,
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

async function listQuestions(query: ListQuestionsQuery): Promise<ListQuestionsResult> {
  const { items, total } = await questionBankRepository.listQuestions({
    categoryId: query.categoryId,
    type: query.type,
    difficulty: query.difficulty,
    collegeId: query.collegeId,
    status: query.status,
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
};
