import type { JUDGE0_LANGUAGE_ID, NormalizedStatus } from './judge0.constants';

export type LanguageId = (typeof JUDGE0_LANGUAGE_ID)[keyof typeof JUDGE0_LANGUAGE_ID];

// Field names deliberately mirror Judge0's raw wire format (snake_case),
// since this is sent to Judge0's HTTP API as-is — there's no benefit to a
// camelCase translation layer for a type whose only job is "what we POST".
export interface SubmissionRequest {
  source_code: string;
  language_id: LanguageId;
  stdin?: string;
  expected_output?: string;
  // Seconds — convert from coding_question_details.time_limit_ms (ms) at the
  // call site; that conversion is out of scope here (modules/coding, Phase 11).
  cpu_time_limit?: number;
  // KB — same unit as coding_question_details.memory_limit_kb, no conversion needed.
  memory_limit?: number;
}

export interface Judge0StatusResponse {
  id: number;
  description: string;
}

// Judge0's raw, unnormalized submission response shape (GET /submissions/:token).
export interface Judge0SubmissionResponse {
  token: string;
  status: Judge0StatusResponse;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  // Judge0 returns this as a numeric string (e.g. "0.005") in its raw JSON —
  // SubmissionResult.time below is the parsed number, this is the raw string.
  time: string | null;
  memory: number | null;
}

export interface CreateSubmissionResponse {
  token: string;
}

// submission.service.ts's normalized shape — status.id becomes the semantic
// NormalizedStatus, and time is parsed to a number.
export interface SubmissionResult {
  token: string;
  status: NormalizedStatus;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: number | null;
  memory: number | null;
}
