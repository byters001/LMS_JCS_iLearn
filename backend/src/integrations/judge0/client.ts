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

  // lastError.message folded into THIS error's own message, not just left
  // inside `details.cause` — same fix as integrations/email/client.ts's
  // withResilience, for the same reason: a native Error's message/stack are
  // non-enumerable, so JSON.stringify({ cause: lastError }) silently drops
  // the message text (pino's serialization of a nested, non-top-level error
  // does too) — this line is what keeps the real Judge0 reason (now
  // present, see rawRequest's error construction above) visible from the
  // top-level message alone, not just from a `body` property a log viewer
  // might not expand.
  const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ServiceUnavailableError(
    `Judge0 request "${operationName}" failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastErrorMessage}`,
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

// Judge0's own validation-error responses are field-keyed arrays of message
// strings — e.g. a 422 from POST /submissions with no source_code returns
// {"source_code":["can't be blank"]}, and a bad language_id returns
// {"language_id":["can't be blank","language with id  doesn't exist"]}
// (confirmed directly against a live Judge0 instance before writing this,
// not assumed from docs). This is a DIFFERENT shape from Resend's own
// {statusCode, name, message} error body (integrations/email/client.ts) —
// Judge0 has no single top-level `message` field, so that extractor can't
// be reused as-is; this flattens every field's message array into one
// readable string instead.
type Judge0ErrorBody = Record<string, string[]>;

function extractJudge0ErrorMessage(body: unknown, fallback: string): string {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const entries = Object.entries(body as Judge0ErrorBody)
      .filter(([, messages]) => Array.isArray(messages))
      .map(([field, messages]) => `${field}: ${messages.join(', ')}`);
    if (entries.length > 0) {
      return entries.join('; ');
    }
  }
  return fallback;
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
    // Read the body BEFORE throwing — same fix as integrations/email/
    // client.ts's rawSendEmail applied to Resend earlier this session. The
    // previous version here threw `status ${response.statusText}` without
    // ever calling response.text()/json(), discarding the one place Judge0's
    // actual validation reason ever existed (statusText is just the generic
    // HTTP reason phrase, e.g. "Unprocessable Entity" — never Judge0's own
    // per-field message). Judge0 doesn't always return JSON on every
    // failure path (a raw 5xx from an upstream proxy could be plain
    // text/HTML), so JSON.parse is attempted and the raw text kept as a
    // fallback rather than assumed.
    const rawBody = await response.text();
    let parsedBody: unknown = rawBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      // Not JSON — parsedBody stays the raw text.
    }

    const judge0Message = extractJudge0ErrorMessage(
      parsedBody,
      rawBody || `${response.status} ${response.statusText}`,
    );

    // status/statusText/body assigned AFTER construction — these are
    // enumerable own properties (unlike a native Error's built-in
    // message/stack, which JSON.stringify silently drops — see email/
    // client.ts's withResilience comment for exactly how that previously
    // caused "cause: {}" in logs), so they survive once this propagates up
    // through withResilience's `{ cause: lastError }`.
    const error = new Error(
      `Judge0 request failed: ${response.status} ${response.statusText} — ${judge0Message}`,
    ) as Error & { status: number; statusText: string; body: unknown };
    error.status = response.status;
    error.statusText = response.statusText;
    error.body = parsedBody;
    throw error;
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

const HEALTH_CHECK_TIMEOUT_MS = 2000;

// For plugins/health.plugin.ts's GET /readyz. Deliberately bypasses
// judge0Request/withResilience/withTimeout entirely — a readiness probe
// needs to be fast and cheap (orchestrators expect a quick yes/no, not a
// check that can take up to ~15s across 3 retried, backed-off attempts).
// This is a single fetch with its own short timeout, no retry, and no
// interaction with the circuit breaker state above: a failed health check
// shouldn't itself count as a "consecutive failure" that trips the breaker
// protecting real submission traffic, and an already-open breaker shouldn't
// make readiness reporting slower than it needs to be either.
export async function checkJudge0Reachable(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  try {
    const url = new URL('/languages', env.JUDGE0_BASE_URL);
    const headers: Record<string, string> = {};
    if (env.JUDGE0_API_KEY) {
      headers['X-Auth-Token'] = env.JUDGE0_API_KEY;
    }

    const response = await fetch(url, { headers, signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
