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
// listQuestionsQuerySchema exactly — confirmed by reading the real schema,
// not assumed: categoryId/type/difficulty/collegeId/status/page/pageSize
// only. No `search`/`q` text-search param exists.
export interface ListQuestionsParams {
  page?: number
  pageSize?: number
  categoryId?: string
  type?: QuestionType
  difficulty?: QuestionDifficulty
  collegeId?: string
  status?: QuestionStatus
}

export interface ListQuestionsResponse {
  items: Question[]
  total: number
  page: number
  pageSize: number
}

// The version-scoped content GET /questions/:id joins in — only the fields
// the picker needs (questionText for the label/search), not the full
// options/images/codingDetails/testCases/psychometric* payload.
export interface QuestionVersionContent {
  id: string
  questionId: string
  versionNumber: number
  questionText: string
  marks: string
  isActiveVersion: boolean
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
// page/pageSize. No text-search param here either.
export interface ListQuestionPoolsParams {
  page?: number
  pageSize?: number
  collegeId?: string
  categoryId?: string
  type?: QuestionType
}

export interface ListQuestionPoolsResponse {
  items: QuestionPool[]
  total: number
  page: number
  pageSize: number
}
