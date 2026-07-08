import { judge0Get, judge0Post } from './client';
import {
  DEFAULT_POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
  isPendingStatus,
  normalizeStatus,
} from './judge0.constants';
import type {
  CreateSubmissionResponse,
  Judge0SubmissionResponse,
  SubmissionRequest,
  SubmissionResult,
} from './judge0.types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// base64_encoded=false: stdout/stderr/compile_output come back as plain text
// instead of base64, so normalizeSubmission() doesn't need a decode step.
const BASE64_DISABLED_QUERY = { base64_encoded: 'false' };

async function createSubmission(request: SubmissionRequest): Promise<CreateSubmissionResponse> {
  // No `wait=true` — this deliberately returns a token immediately rather
  // than blocking Judge0-side; pollUntilComplete() is how callers wait.
  return judge0Post<CreateSubmissionResponse>('/submissions', request, BASE64_DISABLED_QUERY);
}

// Returns Judge0's raw (unnormalized) response — pollUntilComplete() is the
// one that normalizes into SubmissionResult, since a caller polling for
// pending/processing status needs the raw status.id to check isPendingStatus().
async function getSubmission(token: string): Promise<Judge0SubmissionResponse> {
  return judge0Get<Judge0SubmissionResponse>(`/submissions/${token}`, BASE64_DISABLED_QUERY);
}

async function createBatch(requests: SubmissionRequest[]): Promise<CreateSubmissionResponse[]> {
  return judge0Post<CreateSubmissionResponse[]>(
    '/submissions/batch',
    { submissions: requests },
    BASE64_DISABLED_QUERY,
  );
}

function normalizeSubmission(token: string, raw: Judge0SubmissionResponse): SubmissionResult {
  return {
    token,
    status: normalizeStatus(raw.status.id),
    stdout: raw.stdout,
    stderr: raw.stderr,
    compile_output: raw.compile_output,
    time: raw.time !== null ? Number(raw.time) : null,
    memory: raw.memory,
  };
}

async function pollUntilComplete(token: string): Promise<SubmissionResult> {
  let raw = await getSubmission(token);

  for (
    let attempt = 1;
    attempt < MAX_POLL_ATTEMPTS && isPendingStatus(normalizeStatus(raw.status.id));
    attempt += 1
  ) {
    await sleep(DEFAULT_POLL_INTERVAL_MS);
    raw = await getSubmission(token);
  }

  // If still pending after MAX_POLL_ATTEMPTS, this returns the last known
  // (still-pending) state rather than throwing — deciding what "polling
  // timed out" means for the caller is a modules/coding concern (Phase 11).
  return normalizeSubmission(token, raw);
}

export const submissionService = {
  createSubmission,
  getSubmission,
  createBatch,
  pollUntilComplete,
};
