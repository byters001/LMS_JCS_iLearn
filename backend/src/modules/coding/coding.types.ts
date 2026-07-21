import type { CodingSubmission } from '../../db/types';

export type { CodingSubmission };

// One test case's Judge0 execution outcome, persisted inside
// coding_submissions.execution_output (JSONB). Includes the raw
// stdout/stderr/compile_output Judge0 returned for THIS test case — this is
// the internal grading record, not the student-facing shape; redaction for
// hidden test cases (never send their input/expectedOutput/actual output to
// a student) happens one layer up, in attempts.service.ts's submitCode,
// which maps this onto attempts.types.ts's SanitizedTestCaseResult. That
// mirrors the existing split between question-bank's raw CodingTestCase row
// and attempts.types.ts's SanitizedTestCase for sample test cases.
export interface TestCaseExecutionResult {
  testCaseId: string;
  isHidden: boolean;
  sortOrder: number;
  status: string;
  time: number | null;
  memory: number | null;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
}

// coding.service.ts's gradeSubmission result — the objective execution
// facts only. Deliberately does NOT include isCorrect/marksObtained:
// applying the grading FORMULA to these facts is attempts.service.ts's
// job (see its submitCode module comment), mirroring how it already
// computes MCQ's isCorrect/marksObtained itself rather than question-bank
// doing it. executionOutput is the same per-test-case array persisted onto
// coding_submissions — returned here too (not re-queried) since
// gradeSubmission already built it in memory, and attempts.service.ts's
// submitCode needs it to build the student-facing per-case breakdown.
export interface GradedSubmissionResult {
  submission: CodingSubmission;
  testCasesPassed: number;
  testCasesTotal: number;
  executionOutput: TestCaseExecutionResult[];
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
