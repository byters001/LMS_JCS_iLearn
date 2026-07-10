import { db } from '../../db/client';
import { codingSubmissions } from '../../db/schema/coding.schema';
import type { CodingSubmission } from '../../db/types';

export interface CreateCodingSubmissionData {
  attemptResponseId: string;
  language: string;
  sourceCode: string;
  testCasesPassed: number;
  testCasesTotal: number;
  compileError?: string | null;
  runtimeError?: string | null;
  executionOutput?: unknown;
}

// Pure INSERT, never upsert — coding_submissions has no unique constraint
// on attempt_response_id (confirmed against schema.sql), by design: each
// resubmission of code for the same question gets its own row, a
// submission history. See db/schema/coding.schema.ts's module comment.
async function createCodingSubmission(
  data: CreateCodingSubmissionData,
): Promise<CodingSubmission> {
  const [row] = await db
    .insert(codingSubmissions)
    .values({
      attemptResponseId: data.attemptResponseId,
      language: data.language,
      sourceCode: data.sourceCode,
      testCasesPassed: data.testCasesPassed,
      testCasesTotal: data.testCasesTotal,
      compileError: data.compileError,
      runtimeError: data.runtimeError,
      executionOutput: data.executionOutput,
    })
    .returning();
  return row;
}

export const codingRepository = {
  createCodingSubmission,
};
