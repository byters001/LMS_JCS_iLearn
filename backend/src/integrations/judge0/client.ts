import { env } from '../../config/env';
import { logger } from '../../logger';
import { ServiceUnavailableError } from '../../shared/errors/app-error';

const CALL_TIMEOUT_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 200;
const MAX_RETRY_DELAY_MS = 2000;

const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000;

// Same shape as integrations/supabase/storage.ts's withTimeout/withResilience
// (which itself matches redis/client.ts's retryStrategy) — exponential
// backoff capped at a max delay, per-attempt timeout via Promise.race.
function retryDelay(attempt: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Judge0 call timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

async function withResilience<T>(operationName: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await withTimeout(operation, CALL_TIMEOUT_MS);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        await sleep(retryDelay(attempt));
      }
    }
  }

  throw new ServiceUnavailableError(
    `Judge0 request "${operationName}" failed after ${MAX_RETRY_ATTEMPTS} attempts`,
    { cause: lastError },
  );
}

// Circuit breaker state — module-level singleton. Judge0 is self-hosted and
// can go down independently of this backend; short-circuiting avoids piling
// up 5s-timeout retries against a service that's already known to be down.
let consecutiveFailures = 0;
let circuitOpenedAt: number | null = null;

function isCircuitOpen(): boolean {
  if (circuitOpenedAt === null) {
    return false;
  }
  if (Date.now() - circuitOpenedAt >= CIRCUIT_BREAKER_COOLDOWN_MS) {
    // Cooldown elapsed — let the next call through as a trial, resetting
    // state so a single success closes the circuit again.
    circuitOpenedAt = null;
    consecutiveFailures = 0;
    return false;
  }
  return true;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenedAt = null;
}

function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD && circuitOpenedAt === null) {
    circuitOpenedAt = Date.now();
    logger.error(
      { consecutiveFailures },
      'Judge0 circuit breaker opened — short-circuiting further calls for 30s',
    );
  }
}

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  query?: Record<string, string>;
}

async function rawRequest<T>(options: RequestOptions): Promise<T> {
  const url = new URL(options.path, env.JUDGE0_BASE_URL);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Only attach the header when a key is actually configured — a self-hosted
  // Judge0 instance with no auth enabled should never receive a spurious
  // empty auth header. X-Auth-Token is Judge0's documented default header
  // name for self-hosted deployments (distinct from RapidAPI's X-RapidAPI-Key).
  if (env.JUDGE0_API_KEY) {
    headers['X-Auth-Token'] = env.JUDGE0_API_KEY;
  }

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Judge0 request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function judge0Request<T>(options: RequestOptions): Promise<T> {
  if (isCircuitOpen()) {
    throw new ServiceUnavailableError(
      'Judge0 is temporarily unavailable (circuit breaker open) — try again shortly',
    );
  }

  try {
    const result = await withResilience(`${options.method} ${options.path}`, () => rawRequest<T>(options));
    recordSuccess();
    return result;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

export async function judge0Get<T>(path: string, query?: Record<string, string>): Promise<T> {
  return judge0Request<T>({ method: 'GET', path, query });
}

export async function judge0Post<T>(
  path: string,
  body: unknown,
  query?: Record<string, string>,
): Promise<T> {
  return judge0Request<T>({ method: 'POST', path, body, query });
}
