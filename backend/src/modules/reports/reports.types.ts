import type { Assessment, AssessmentAttempt } from '../../db/types';

// One row of reports.repository.ts's listMyAttempts/findAttemptSummaryById
// — the attempt's own fields plus its assessment's title/testCategory (a
// plain JOIN done directly in the repository, not a cross-module SERVICE
// call — reports is CLAUDE.md's explicit cross-module-QUERY exception,
// since its whole purpose is cross-cutting aggregation).
export interface MyAttemptSummary {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  testCategory: Assessment['testCategory'];
  status: AssessmentAttempt['status'];
  attemptNumber: number;
  isRetake: boolean;
  totalScore: string | null;
  submissionTime: Date | null;
  createdAt: Date;
}

export interface ListMyAttemptsResult {
  items: MyAttemptSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// Per-question breakdown row for the detail view — deliberately UNIFORM
// across mcq/coding/psychometric (questionText, marksPossible,
// marksObtained, isCorrect only), not the fully type-enriched shape
// attempts.service.ts's getAttemptQuestions returns (options/
// psychometricOptions/coding sample test cases). This is a post-hoc score
// report, not a render-the-test payload — see reports.service.ts's module
// comment for exactly which fields were deliberately excluded and why.
// latestCodingTestCases is the one coding-specific addition: aggregate
// pass/total counts ONLY from the student's most recent coding_submissions
// row for that question — never source_code/compile_error/runtime_error/
// execution_output, and explicitly NOT guaranteed to correspond to the
// submission that produced the recorded marksObtained/isCorrect (see the
// service's comment on why: "best result wins" grading means the
// recorded grade may reflect an earlier, better submission than the
// latest one).
export interface AttemptQuestionBreakdown {
  questionVersionId: string;
  sortOrder: number;
  questionText: string;
  marksPossible: string;
  marksObtained: string | null;
  isCorrect: boolean | null;
  latestCodingTestCases: { passed: number; total: number } | null;
}

export interface MyAttemptDetail {
  attempt: MyAttemptSummary;
  questions: AttemptQuestionBreakdown[];
}
