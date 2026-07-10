import type { CodingSubmission } from '../../db/types';

export type { CodingSubmission };

// One test case's Judge0 execution outcome, persisted inside
// coding_submissions.execution_output (JSONB) — deliberately compact (no
// stdout/expectedOutput dumps) since this is an internal grading record,
// never exposed to students via attempts.service.ts's getAttemptQuestions.
export interface TestCaseExecutionResult {
  testCaseId: string;
  isHidden: boolean;
  sortOrder: number;
  status: string;
  time: number | null;
  memory: number | null;
}

// coding.service.ts's gradeSubmission result — the objective execution
// facts only. Deliberately does NOT include isCorrect/marksObtained:
// applying the grading FORMULA to these facts is attempts.service.ts's
// job (see its submitCode module comment), mirroring how it already
// computes MCQ's isCorrect/marksObtained itself rather than question-bank
// doing it.
export interface GradedSubmissionResult {
  submission: CodingSubmission;
  testCasesPassed: number;
  testCasesTotal: number;
}

// coding.service.ts's gradeSubmission input — deliberately its OWN shape
// (not question-bank's CodingQuestionDetails/CodingTestCase row types
// passed straight through), so this module stays decoupled from
// question-bank's exact DB row shape; attempts.service.ts maps
// QuestionVersionWithContent's fields onto these at the call site.
export interface CodingDetailsInput {
  timeLimitMs: number;
  memoryLimitKb: number;
  supportedLanguages: string[];
}

export interface TestCaseInput {
  id: string;
  input: string | null;
  expectedOutput: string | null;
  isHidden: boolean;
  sortOrder: number;
}

export interface GradeSubmissionParams {
  attemptResponseId: string;
  language: string;
  sourceCode: string;
  codingDetails: CodingDetailsInput | null;
  testCases: TestCaseInput[];
}
