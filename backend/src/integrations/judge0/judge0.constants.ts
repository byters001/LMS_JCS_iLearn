// Judge0 CE's public /languages list. These IDs are stable and documented —
// Judge0 doesn't renumber existing languages when new ones are added, so
// hardcoding them here is safe.
export const JUDGE0_LANGUAGE_ID = {
  C: 50, // C (GCC 9.2.0)
  CPP: 54, // C++ (GCC 9.2.0)
  JAVA: 62, // Java (OpenJDK 13.0.1)
  JAVASCRIPT: 63, // JavaScript (Node.js 12.14.0)
  PYTHON3: 71, // Python (3.8.1)
} as const;

// Judge0's numeric status.id values (https://ce.judge0.com/statuses). 1/2 are
// non-terminal (still queued/running); 7-12 are all "Runtime Error" variants
// distinguished only by signal, which callers of this codebase don't need to
// tell apart — they all normalize to the same 'runtime_error' bucket.
export const JUDGE0_STATUS_ID = {
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  RUNTIME_ERROR_SIGSEGV: 7,
  RUNTIME_ERROR_SIGXFSZ: 8,
  RUNTIME_ERROR_SIGFPE: 9,
  RUNTIME_ERROR_SIGABRT: 10,
  RUNTIME_ERROR_NZEC: 11,
  RUNTIME_ERROR_OTHER: 12,
  INTERNAL_ERROR: 13,
  EXEC_FORMAT_ERROR: 14,
} as const;

export const NORMALIZED_STATUS = {
  IN_QUEUE: 'in_queue',
  PROCESSING: 'processing',
  ACCEPTED: 'accepted',
  WRONG_ANSWER: 'wrong_answer',
  TIME_LIMIT_EXCEEDED: 'time_limit_exceeded',
  COMPILE_ERROR: 'compile_error',
  RUNTIME_ERROR: 'runtime_error',
  INTERNAL_ERROR: 'internal_error',
  EXEC_FORMAT_ERROR: 'exec_format_error',
} as const;

export type NormalizedStatus = (typeof NORMALIZED_STATUS)[keyof typeof NORMALIZED_STATUS];

const PENDING_STATUSES: readonly NormalizedStatus[] = [
  NORMALIZED_STATUS.IN_QUEUE,
  NORMALIZED_STATUS.PROCESSING,
];

export function isPendingStatus(status: NormalizedStatus): boolean {
  return PENDING_STATUSES.includes(status);
}

const JUDGE0_STATUS_MAP: Record<number, NormalizedStatus> = {
  [JUDGE0_STATUS_ID.IN_QUEUE]: NORMALIZED_STATUS.IN_QUEUE,
  [JUDGE0_STATUS_ID.PROCESSING]: NORMALIZED_STATUS.PROCESSING,
  [JUDGE0_STATUS_ID.ACCEPTED]: NORMALIZED_STATUS.ACCEPTED,
  [JUDGE0_STATUS_ID.WRONG_ANSWER]: NORMALIZED_STATUS.WRONG_ANSWER,
  [JUDGE0_STATUS_ID.TIME_LIMIT_EXCEEDED]: NORMALIZED_STATUS.TIME_LIMIT_EXCEEDED,
  [JUDGE0_STATUS_ID.COMPILATION_ERROR]: NORMALIZED_STATUS.COMPILE_ERROR,
  [JUDGE0_STATUS_ID.RUNTIME_ERROR_SIGSEGV]: NORMALIZED_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS_ID.RUNTIME_ERROR_SIGXFSZ]: NORMALIZED_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS_ID.RUNTIME_ERROR_SIGFPE]: NORMALIZED_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS_ID.RUNTIME_ERROR_SIGABRT]: NORMALIZED_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS_ID.RUNTIME_ERROR_NZEC]: NORMALIZED_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS_ID.RUNTIME_ERROR_OTHER]: NORMALIZED_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS_ID.INTERNAL_ERROR]: NORMALIZED_STATUS.INTERNAL_ERROR,
  [JUDGE0_STATUS_ID.EXEC_FORMAT_ERROR]: NORMALIZED_STATUS.EXEC_FORMAT_ERROR,
};

// Falls back to 'internal_error' for any status id Judge0 might introduce in
// the future that isn't in the map above, rather than throwing/crashing.
export function normalizeStatus(statusId: number): NormalizedStatus {
  return JUDGE0_STATUS_MAP[statusId] ?? NORMALIZED_STATUS.INTERNAL_ERROR;
}

export const DEFAULT_POLL_INTERVAL_MS = 1000;
export const MAX_POLL_ATTEMPTS = 10;
