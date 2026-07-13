// Frontend-side types for the "attempts" feature (own copy, not shared with
// the backend's *.types.ts). Matches the raw assessment_attempts row shape
// returned by POST /attempts (backend/src/db/schema/attempts.schema.ts).
export type AttemptStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'pending_evaluation'
  | 'invalidated'

export interface Attempt {
  id: string
  assessmentId: string
  studentId: string
  attemptNumber: number
  status: AttemptStatus
  startTime: string | null
  endTime: string | null
  submissionTime: string | null
  ipAddress: string | null
  browserInfo: string | null
  totalScore: string | null
  rankInBatch: number | null
  isRetake: boolean
  createdAt: string
  updatedAt: string
}

// --- Part 2: GET /attempts/:attemptId/questions ---
// Matches backend/src/modules/attempts/attempts.types.ts's
// AttemptQuestionContent exactly, confirmed against
// attempts.service.ts's buildRenderableQuestion — is_correct/trait_weight/
// hidden test cases/test case points are never sent to the frontend at all
// (not just hidden by convention), so there is nothing to accidentally
// leak by trusting this shape. Modeled as a discriminated union on `type`
// (not one flat interface with optional fields) so a component reading
// `question.options` on a coding question is a compile error, not a
// silent `undefined` — the three question types genuinely don't share a
// shape.
export type QuestionType = 'mcq' | 'coding' | 'psychometric'

export interface AttemptOption {
  id: string
  optionText: string
  imageUrl: string | null
  sortOrder: number
}

// Confirmed against live backend responses: a psychometric question can
// have zero seeded options (empty array, not omitted/null) — components
// rendering this must treat an empty array as "no options configured yet"
// UI state, not an error.
export interface AttemptPsychometricOption {
  id: string
  optionText: string
  sortOrder: number
}

export interface AttemptTestCase {
  id: string
  input: string | null
  expectedOutput: string | null
  sortOrder: number
}

export interface AttemptCodingContent {
  problemStatement: string
  inputFormat: string | null
  outputFormat: string | null
  constraints: string | null
  timeLimitMs: number
  memoryLimitKb: number
  supportedLanguages: string[]
  sampleTestCases: AttemptTestCase[]
}

interface AttemptQuestionBase {
  id: string
  assessmentSectionId: string
  questionVersionId: string
  questionText: string
  marks: string
  sortOrder: number
}

export interface McqAttemptQuestion extends AttemptQuestionBase {
  type: 'mcq'
  options: AttemptOption[]
}

export interface PsychometricAttemptQuestion extends AttemptQuestionBase {
  type: 'psychometric'
  psychometricOptions: AttemptPsychometricOption[]
}

// `coding` itself can be absent — buildRenderableQuestion leaves it
// undefined when coding_question_details hasn't been authored yet for this
// question version, which is a real (not error) state a trainer can leave
// a question in.
export interface CodingAttemptQuestion extends AttemptQuestionBase {
  type: 'coding'
  coding?: AttemptCodingContent
}

export type AttemptQuestion =
  | McqAttemptQuestion
  | PsychometricAttemptQuestion
  | CodingAttemptQuestion
