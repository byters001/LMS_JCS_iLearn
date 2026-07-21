import {
  JUDGE0_LANGUAGE_ID,
  submissionService,
  type LanguageId,
  type SubmissionRequest,
  type SubmissionResult,
} from '../../integrations/judge0';
import { ValidationError } from '../../shared/errors/app-error';
import { codingRepository } from './coding.repository';
import type { GradeSubmissionParams, GradedSubmissionResult, TestCaseExecutionResult } from './coding.types';

// language has already been validated against JUDGE0_LANGUAGE_ID's keys at
// the Zod layer (coding.schema.ts's submitCodeSchema reuses question-bank's
// codingLanguageSchema) before this function ever runs — this indexed
// lookup is safe, not a runtime assumption.
function toLanguageId(language: string): LanguageId {
  return JUDGE0_LANGUAGE_ID[language as keyof typeof JUDGE0_LANGUAGE_ID];
}

function buildSubmissionRequest(
  testCase: GradeSubmissionParams['testCases'][number],
  languageId: LanguageId,
  sourceCode: string,
  timeLimitMs: number,
  memoryLimitKb: number,
): SubmissionRequest {
  return {
    source_code: sourceCode,
    language_id: languageId,
    stdin: testCase.input ?? undefined,
    expected_output: testCase.expectedOutput ?? undefined,
    // ms -> seconds; memory is already the same unit (KB) Judge0 expects —
    // this is the exact conversion judge0.types.ts's SubmissionRequest
    // comment already flagged as "out of scope here, modules/coding" back
    // when that file was written. This is that call site.
    cpu_time_limit: timeLimitMs / 1000,
    memory_limit: memoryLimitKb,
  };
}

// Only 'accepted' counts as a pass. Every other terminal status
// (wrong_answer, time_limit_exceeded, compile_error, runtime_error,
// internal_error, exec_format_error) counts as a fail for that test case
// — including a status that was STILL pending after
// pollUntilComplete's own MAX_POLL_ATTEMPTS ("give up, return last known
// state" — see submission.service.ts). There's no reasonable case for
// treating "we never found out" as a pass.
function isPassingResult(result: SubmissionResult): boolean {
  return result.status === 'accepted';
}

// The core Judge0 orchestration — the first real call this codebase makes
// from a module into integrations/judge0/submission.service.ts (per
// CLAUDE.md's boundary rule: only modules/coding/ may do this; attempts
// never calls submissionService or the raw client directly).
//
// ALL test cases (visible AND hidden — grading needs every one, even
// though attempts.service.ts's getAttemptQuestions correctly hides hidden
// ones from display) are submitted as ONE Judge0 batch call via
// submissionService.createBatch. Confirmed usable for this exact case by
// reading its actual signature (submission.service.ts): it takes
// SubmissionRequest[] and returns CreateSubmissionResponse[] — one token
// per request, in the same order submitted (Judge0's own documented
// batch-endpoint guarantee). N individual createSubmission calls were
// considered and rejected: that's N separate HTTP round-trips (each
// carrying its own timeout/retry/circuit-breaker overhead) for what's
// fundamentally one logical submission — strictly worse than one batch
// call, with no upside batch doesn't already cover.
//
// pollUntilComplete then runs once per token, in PARALLEL (Promise.all) —
// each token's poll loop is independent, and Judge0 already executes
// batch submissions concurrently server-side, so there's no reason to
// serialize polling.
//
// ALL-OR-NOTHING on failure (item 4): if ANY token's poll throws (Judge0
// becomes unreachable mid-batch — integrations/judge0/client.ts's
// ServiceUnavailableError, whether from exhausted retries or an open
// circuit breaker), Promise.all rejects immediately and this function
// throws without persisting anything — no coding_submissions row, no
// return value for the caller to act on. This is deliberate: a
// coding_submissions row whose test_cases_total doesn't match the
// question's real test case count (because some never got a result)
// would be worse than no row at all, and attempts.service.ts's submitCode
// never reaches the point of upserting a grade. ServiceUnavailableError is
// already an AppError (503) — the student sees a clear, correctly-coded
// "temporarily unavailable, try again" response, not a raw crash or a
// half-graded result. Retrying is safe: nothing partial was written here,
// and the route's REQUIRED Idempotency-Key (attempts.routes.ts) actively
// releases its claim on any 5xx response (plugins/idempotency.plugin.ts's
// preSerialization deletes rather than caches on 5xx) — so an immediate
// retry with the same key genuinely re-attempts rather than replaying a
// stale failure.
async function gradeSubmission(params: GradeSubmissionParams): Promise<GradedSubmissionResult> {
  const { attemptResponseId, language, sourceCode, codingDetails, testCases } = params;

  if (!codingDetails) {
    throw new ValidationError('This question has no coding details configured — cannot grade');
  }
  if (testCases.length === 0) {
    throw new ValidationError('This question has no test cases configured — cannot grade');
  }
  if (
    codingDetails.supportedLanguages.length > 0 &&
    !codingDetails.supportedLanguages.includes(language)
  ) {
    throw new ValidationError(
      `"${language}" is not a supported language for this question (supported: ${codingDetails.supportedLanguages.join(', ')})`,
    );
  }

  const languageId = toLanguageId(language);
  const requests = testCases.map((testCase) =>
    buildSubmissionRequest(
      testCase,
      languageId,
      sourceCode,
      codingDetails.timeLimitMs,
      codingDetails.memoryLimitKb,
    ),
  );

  const created = await submissionService.createBatch(requests);
  const results = await Promise.all(
    created.map((submission) => submissionService.pollUntilComplete(submission.token)),
  );

  const executionOutput: TestCaseExecutionResult[] = testCases.map((testCase, index) => ({
    testCaseId: testCase.id,
    isHidden: testCase.isHidden,
    sortOrder: testCase.sortOrder,
    status: results[index].status,
    time: results[index].time,
    memory: results[index].memory,
    stdout: results[index].stdout,
    stderr: results[index].stderr,
    compileOutput: results[index].compile_output,
  }));

  const testCasesPassed = results.filter(isPassingResult).length;
  const testCasesTotal = results.length;

  // Compilation is deterministic for a given (source_code, language) pair,
  // so within one batch every test case either all compile or all fail to
  // — checking for the first occurrence of each error status is
  // representative of the whole submission, not just that one test case.
  const compileErrorResult = results.find((result) => result.status === 'compile_error');
  const runtimeErrorResult = results.find((result) => result.status === 'runtime_error');

  const submission = await codingRepository.createCodingSubmission({
    attemptResponseId,
    language,
    sourceCode,
    testCasesPassed,
    testCasesTotal,
    compileError: compileErrorResult?.compile_output ?? null,
    runtimeError: runtimeErrorResult?.stderr ?? null,
    executionOutput,
  });

  return { submission, testCasesPassed, testCasesTotal, executionOutput };
}

export const codingService = {
  gradeSubmission,
};
