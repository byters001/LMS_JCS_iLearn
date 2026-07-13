// Frontend-side types for the "reports" feature (own copy, not shared with
// the backend's *.types.ts — same convention every other feature here
// follows). Matches backend/src/modules/reports/reports.types.ts exactly;
// dates arrive as ISO strings over JSON, not Date instances.

// Local copies rather than importing features/attempts' or
// features/assessments' types — every feature in this codebase owns its
// own type copies rather than cross-importing from a sibling feature.
export type AttemptStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'pending_evaluation'
  | 'invalidated'

export type TestCategory = 'mcq' | 'coding' | 'psychometric' | 'mixed'

export interface MyAttemptSummary {
  id: string
  assessmentId: string
  assessmentTitle: string
  testCategory: TestCategory
  status: AttemptStatus
  attemptNumber: number
  isRetake: boolean
  totalScore: string | null
  submissionTime: string | null
  createdAt: string
}

export interface ListMyAttemptsParams {
  page?: number
  pageSize?: number
}

export interface ListMyAttemptsResult {
  items: MyAttemptSummary[]
  total: number
  page: number
  pageSize: number
}

// Deliberately UNIFORM across mcq/coding/psychometric — the backend's own
// reports.service.ts explains exactly why nothing beyond these fields is
// ever returned, even for the student's own completed attempt: no
// selectedOptionId, no full MCQ option list, no psychometric trait
// weights, no hidden test case content. This is a post-hoc score report,
// not a render-the-test payload — the frontend must not invent an "answer
// review" UI (e.g. "you selected X, the correct answer was Y") beyond what
// these fields actually support.
export interface AttemptQuestionBreakdown {
  questionVersionId: string
  sortOrder: number
  questionText: string
  marksPossible: string
  marksObtained: string | null
  // null for psychometric (no "correct answer" concept — see
  // reports.service.ts's buildQuestionBreakdown); a real boolean for
  // mcq/coding.
  isCorrect: boolean | null
  // Coding-only, and explicitly NOT guaranteed to match marksObtained/
  // isCorrect — see backend's AttemptQuestionBreakdown comment: "best
  // result wins" grading means the recorded grade may reflect an earlier,
  // better submission than the latest one. Labeled "latest" in the UI for
  // exactly this reason.
  latestCodingTestCases: { passed: number; total: number } | null
}

export interface MyAttemptDetail {
  attempt: MyAttemptSummary
  questions: AttemptQuestionBreakdown[]
}
