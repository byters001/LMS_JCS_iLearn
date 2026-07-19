// Frontend-side types for the "question-bank" feature (own copy, not shared
// with the backend's *.types.ts).
export type QuestionType = 'mcq' | 'coding' | 'psychometric'
export type QuestionDifficulty = 'easy' | 'medium' | 'hard'
export type QuestionStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived'

// Matches the raw `questions` row shape — GET /questions returns bare rows
// only (backend/src/modules/question-bank/question-bank.types.ts's
// ListQuestionsResult is `Question[]`, not the version-joined shape).
// Notably NO question text here — question_text lives on question_versions,
// only reachable via currentVersionId + a follow-up fetch (see
// QuestionWithCurrentVersion below and api.ts's useQuestionsForPicker).
export interface Question {
  id: string
  categoryId: string | null
  type: QuestionType
  difficulty: QuestionDifficulty
  collegeId: string | null
  status: QuestionStatus
  currentVersionId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

// Matches backend/src/modules/question-bank/question-bank.schema.ts's
// listQuestionsQuerySchema exactly — categoryId/type/difficulty/collegeId/
// status/page/pageSize/search. Item 5a correction: an earlier version of
// this comment claimed no `search` param existed — false, confirmed by
// reading question-bank.repository.ts's listQuestions directly, which
// already LEFT JOINs question_versions and applies a real
// `ilike(questionVersions.questionText, ...)` filter when search is
// present. That comment was simply never updated after the backend gained
// it in a later phase; this type just hadn't caught up.
export interface ListQuestionsParams {
  page?: number
  pageSize?: number
  categoryId?: string
  type?: QuestionType
  difficulty?: QuestionDifficulty
  collegeId?: string
  status?: QuestionStatus
  search?: string
}

export interface ListQuestionsResponse {
  items: Question[]
  total: number
  page: number
  pageSize: number
}

// A question_options row as GET /questions/:id actually returns it — this
// is the STAFF-facing preview (QuestionDetailPage), not the sanitized
// test-taker shape features/attempts/types.ts's AttemptOption uses, so
// isCorrect is included here on purpose (matches backend's real
// QuestionOption row, confirmed against db/schema/question-bank.schema.ts).
export interface QuestionOptionContent {
  id: string
  optionText: string
  imageUrl: string | null
  isCorrect: boolean
  sortOrder: number
}

// A question_images row — question-level illustrative images, applies to
// any question type.
export interface QuestionImageContent {
  id: string
  imageUrl: string
  caption: string | null
  sortOrder: number
}

// The version-scoped content GET /questions/:id joins in. Item 2 expanded
// this from text/marks-only to also carry options/images (both already
// returned by the backend's QuestionVersionWithContent — see
// question-bank.types.ts on the backend — this type had just never been
// widened to match), so QuestionDetailPage can actually render uploaded
// images/options instead of silently dropping them.
export interface QuestionVersionContent {
  id: string
  questionId: string
  versionNumber: number
  questionText: string
  marks: string
  isActiveVersion: boolean
  options: QuestionOptionContent[]
  images: QuestionImageContent[]
}

// Matches backend's QuestionWithCurrentVersion — the questions row plus its
// current version's content, returned by GET /questions/:id only (never by
// the list endpoint).
export interface QuestionWithCurrentVersion extends Question {
  currentVersion: QuestionVersionContent | null
}

// Matches the raw `question_pools` row shape — `name` lives directly on
// this table (unlike questions, no version indirection needed for a label).
export interface QuestionPool {
  id: string
  name: string
  description: string | null
  collegeId: string | null
  categoryId: string | null
  type: QuestionType
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

// Matches listQuestionPoolsQuerySchema exactly: collegeId/categoryId/type/
// search/page/pageSize. search is real (item 5a: `ilike(questionPools.name,
// ...)`, confirmed against question-bank.repository.ts) — same stale-comment
// correction as ListQuestionsParams above.
export interface ListQuestionPoolsParams {
  page?: number
  pageSize?: number
  collegeId?: string
  categoryId?: string
  type?: QuestionType
  search?: string
}

export interface ListQuestionPoolsResponse {
  items: QuestionPool[]
  total: number
  page: number
  pageSize: number
}

// --- Question categories / topics / tags (creation-form pickers) ---

export interface QuestionCategory {
  id: string
  name: string
  parentCategoryId: string | null
  createdAt: string
}

export interface ListQuestionCategoriesParams {
  page?: number
  pageSize?: number
  parentCategoryId?: string
}

export interface ListQuestionCategoriesResponse {
  items: QuestionCategory[]
  total: number
  page: number
  pageSize: number
}

export interface QuestionTopic {
  id: string
  name: string
  categoryId: string | null
  createdAt: string
}

export interface ListQuestionTopicsParams {
  page?: number
  pageSize?: number
  categoryId?: string
}

export interface ListQuestionTopicsResponse {
  items: QuestionTopic[]
  total: number
  page: number
  pageSize: number
}

// question_tags has no createdAt column at all (checked against the real
// table — the most minimal table in this schema, just id + a unique name).
export interface QuestionTag {
  id: string
  name: string
}

export interface ListQuestionTagsParams {
  page?: number
  pageSize?: number
}

export interface ListQuestionTagsResponse {
  items: QuestionTag[]
  total: number
  page: number
  pageSize: number
}

// --- Question creation (this phase) ---

// Matches backend/src/integrations/judge0/judge0.constants.ts's
// JUDGE0_LANGUAGE_ID keys exactly — question-bank.schema.ts's
// codingLanguageSchema validates supportedLanguages against these same
// keys, confirmed by reading both files directly.
export type CodingLanguageKey = 'C' | 'CPP' | 'JAVA' | 'JAVASCRIPT' | 'PYTHON3'

export const CODING_LANGUAGE_LABELS: Record<CodingLanguageKey, string> = {
  C: 'C',
  CPP: 'C++',
  JAVA: 'Java',
  JAVASCRIPT: 'JavaScript',
  PYTHON3: 'Python 3',
}

export interface QuestionOptionInput {
  optionText: string
  imageUrl?: string
  isCorrect?: boolean
  sortOrder?: number
}

// Matches backend's questionImageInputSchema exactly (.strict()) —
// question-level illustrative image, applies to any question type.
export interface QuestionImageInput {
  imageUrl: string
  caption?: string
  sortOrder?: number
}

export interface CodingQuestionDetailsInput {
  problemStatement: string
  inputFormat?: string
  outputFormat?: string
  constraints?: string
  timeLimitMs?: number
  memoryLimitKb?: number
  supportedLanguages?: CodingLanguageKey[]
}

export interface CodingTestCaseInput {
  input?: string
  expectedOutput?: string
  isHidden?: boolean
  points?: number
  sortOrder?: number
}

// scaleType/traitCategory are both optional relabeling metadata, not
// something an attempt requires to be answerable — see
// features/attempts/components/PsychometricQuestion.tsx's own comment:
// the attempt-taking UI always renders a fixed 1-5 scale; psychometric
// options (when present) only relabel each point, they are never the
// selectable choices themselves.
export interface PsychometricDetailsInput {
  traitCategory?: string
  scaleType?: 'likert' | 'scenario'
}

export interface PsychometricOptionInput {
  optionText: string
  traitWeight?: number
  sortOrder?: number
}

// Matches backend/src/modules/question-bank/question-bank.schema.ts's
// createQuestionSchema exactly (.strict(), confirmed by reading the real
// schema field-for-field, not assumed). codingDetails/testCases and
// psychometricDetails/psychometricOptions are ALL optional here regardless
// of `type` at the schema level — question-bank.service.ts's
// assertTypeSpecificPayloadsMatch only FORBIDS the mismatched pair (a
// coding payload on a non-coding type, etc.), it never REQUIRES the
// matching payload for its own type. The frontend form still requires the
// sensible fields per type client-side (an MCQ with zero options, or a
// coding question with no problem statement, would create technically but
// be useless) — that's a UX choice layered on top of a schema that is
// genuinely this permissive, not a misreading of it.
export interface CreateQuestionInput {
  categoryId?: string
  type: QuestionType
  difficulty: QuestionDifficulty
  collegeId?: string
  questionText: string
  marks?: number
  options?: QuestionOptionInput[]
  images?: QuestionImageInput[]
  codingDetails?: CodingQuestionDetailsInput
  testCases?: CodingTestCaseInput[]
  psychometricDetails?: PsychometricDetailsInput
  psychometricOptions?: PsychometricOptionInput[]
  topicIds?: string[]
  tagIds?: string[]
}

// Matches backend's updateQuestionSchema exactly (.strict(), all fields
// optional, backend rejects an empty body) — metadata only (category/
// difficulty/college), never question CONTENT (question_text/marks/
// options/etc, which lives on question_versions and is governed by a
// completely different mutability rule — see EditQuestionDialog.tsx's own
// comment on why that boundary stays exactly where QuestionDetailPage.tsx
// already drew it). type is deliberately excluded, matching the backend
// exactly — changing a question's type after it may already have
// type-specific version content (coding details, MCQ options, etc.) would
// silently mismatch that content against the new type.
export interface UpdateQuestionInput {
  categoryId?: string | null
  difficulty?: QuestionDifficulty
  collegeId?: string | null
}

// Enriched row for QuestionListPage — same two-step "list then fetch each
// row's text" shape as api.ts's useQuestionsForPicker (GET /questions has
// no question text and no search param; see that hook's comment for the
// full reasoning), but returns the fields a list page's columns need
// instead of one flattened combobox label string.
export interface QuestionWithText {
  id: string
  type: QuestionType
  difficulty: QuestionDifficulty
  status: QuestionStatus
  questionText: string | null
  createdAt: string
}

// --- Approval workflow (this phase) ---

// Matches backend's approvalActionSchema exactly — shared by submit/
// approve/reject, all three take only an optional free-text justification.
export interface ApprovalActionInput {
  notes?: string
}

// --- Question pool creation + criteria (this phase) ---

// Matches backend's createQuestionPoolSchema exactly (.strict()): name,
// description, collegeId, categoryId, type. collegeId is deliberately not
// exposed by CreatePoolPage's form — same precedent CreateQuestionInput
// set for questions: omitted => global reusable pool (question_pools.
// college_id NULL, per question-bank.schema.ts's own comment).
export interface CreatePoolInput {
  name: string
  description?: string
  collegeId?: string
  categoryId?: string
  type: QuestionType
}

// Matches the raw `question_pool_criteria` row shape (db/schema/
// question-bank.schema.ts): id, questionPoolId, difficulty, topicId,
// tagFilter (jsonb string[], nullable), countRequired, createdAt. No
// updatedAt/deletedAt — criteria rows are add/delete only in this UI, no
// dedicated single-item GET (see backend routes' comment on this).
export interface QuestionPoolCriterion {
  id: string
  questionPoolId: string
  difficulty: QuestionDifficulty
  topicId: string | null
  tagFilter: string[] | null
  countRequired: number
  createdAt: string
}

// Matches createQuestionPoolCriteriaSchema exactly (.strict()).
// tagFilter is ANY-match: a question qualifies if it has at least one
// listed tag (see backend schema's own comment on this).
export interface CreatePoolCriterionInput {
  difficulty: QuestionDifficulty
  topicId?: string
  tagFilter?: string[]
  countRequired?: number
}

// Matches updateQuestionPoolSchema exactly (.strict(), all fields
// optional) — name/description only exposed by EditPoolDialog.tsx per
// item 10 tier 3a's explicit scope, even though the real schema also
// accepts collegeId/categoryId (type is the one field genuinely excluded
// backend-side too: question-bank.schema.ts's own comment — changing a
// pool's type after criteria rows already exist against it would silently
// invalidate those rows' intent).
export interface UpdatePoolInput {
  name?: string
  description?: string | null
}

// Matches updateQuestionPoolCriteriaSchema exactly (.strict(), all fields
// optional, backend rejects an empty body).
export interface UpdatePoolCriterionInput {
  difficulty?: QuestionDifficulty
  topicId?: string | null
  tagFilter?: string[] | null
  countRequired?: number
}

// --- Pool resolution ("Preview Resolution") ---

// One resolved question a criterion currently draws — enough to
// sanity-check the preview (question text, difficulty, marks) without a
// follow-up lookup per question. Matches backend's ResolvedPoolQuestion.
export interface ResolvedPoolQuestion {
  questionId: string
  questionVersionId: string
  questionText: string
  difficulty: QuestionDifficulty
  marks: string
}

// eligibleTotal: how many approved questions satisfy this criterion's OWN
// filters, regardless of countRequired — a stable "is this well-supplied"
// signal. selected: the (randomly-ordered) subset actually drawn this
// call, capped at countRequired. selected.length < countRequired is the
// real "under-supplied" signal a curator needs before an assessment
// section can safely depend on this pool. Matches backend's
// ResolvedPoolCriterion exactly.
export interface ResolvedPoolCriterion extends QuestionPoolCriterion {
  eligibleTotal: number
  selected: ResolvedPoolQuestion[]
}

// Matches backend's ResolvedQuestionPool exactly — the full GET
// /question-pools/:id/resolve response shape.
export interface ResolvedQuestionPool {
  pool: QuestionPool
  criteria: ResolvedPoolCriterion[]
  totalRequired: number
  totalSelected: number
  isFullySatisfied: boolean
}
