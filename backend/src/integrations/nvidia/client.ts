import { env } from '../../config/env';
import { logger } from '../../logger';
import { ServiceUnavailableError } from '../../shared/errors/app-error';
import type { NvidiaChatCompletionParams, NvidiaChatCompletionResponse } from './nvidia.types';

// Chat completions (especially with tool-calling) routinely take several
// seconds — longer than judge0/client.ts's or integrations/email/
// client.ts's own 5000ms, both of which call much faster services. 15s
// still bounds a genuinely hung request.
const CALL_TIMEOUT_MS = 15_000;
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 200;
const MAX_RETRY_DELAY_MS = 2000;

const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000;

// Identical shape to integrations/judge0/client.ts's and integrations/
// email/client.ts's own retryDelay/sleep/withTimeout/withResilience +
// circuit-breaker state — deliberately duplicated here, not extracted
// into a shared helper, per the established (no-shared-abstraction)
// precedent email/client.ts's own comment already states for this exact
// pattern: "deliberately duplicated here rather than extracted into a
// shared helper."
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
      reject(new Error(`NVIDIA call timed out after ${timeoutMs}ms`));
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

  // lastError.message is folded into THIS error's own message (not just left
  // inside `details`) for the same reason integrations/email/client.ts's
  // withResilience does — a native Error's message/stack are non-enumerable
  // own properties, so JSON.stringify({ cause: lastError }) (and pino's own
  // serialization of nested, non-top-level error objects inside `details`)
  // silently produces `{}`. Without this, the real NVIDIA failure reason
  // (e.g. "401 Invalid API key" from rawChatCompletion below) never reaches
  // the caller or the logs — only this generic wrapper message would.
  const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ServiceUnavailableError(
    `NVIDIA request "${operationName}" failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastErrorMessage}`,
    { cause: lastError },
  );
}

// Circuit breaker state — module-level singleton, same pattern as judge0/
// client.ts's own. NVIDIA is a third-party hosted API that can degrade
// independently of this backend; short-circuiting avoids piling up
// 15s-timeout retries against a service that's already known to be down.
let consecutiveFailures = 0;
let circuitOpenedAt: number | null = null;

function isCircuitOpen(): boolean {
  if (circuitOpenedAt === null) {
    return false;
  }
  if (Date.now() - circuitOpenedAt >= CIRCUIT_BREAKER_COOLDOWN_MS) {
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
      'NVIDIA circuit breaker opened — short-circuiting further calls for 30s',
    );
  }
}

interface NvidiaErrorBody {
  error?: { message?: string };
}

// Same "pull a real message out of the provider's JSON error body, fall
// back to a generic one" shape as integrations/email/client.ts's
// extractResendErrorMessage.
function extractNvidiaErrorMessage(body: unknown, fallback: string): string {
  if (body !== null && typeof body === 'object' && 'error' in body) {
    const message = (body as NvidiaErrorBody).error?.message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return fallback;
}

async function rawChatCompletion(
  params: NvidiaChatCompletionParams,
): Promise<NvidiaChatCompletionResponse> {
  // NVIDIA_BASE_URL already includes a path segment ('/v1'), unlike
  // JUDGE0_BASE_URL (root-only) which integrations/judge0/client.ts's own
  // `new URL(path, base)` pattern was written for. A leading-slash path
  // passed as the second arg there resolves as absolute and discards the
  // base's own path entirely (WHATWG URL / RFC 3986 relative-resolution
  // rules) — silently dropping '/v1' and hitting the wrong endpoint. String
  // concatenation avoids that.
  const url = new URL(`${env.NVIDIA_BASE_URL.replace(/\/$/, '')}/chat/completions`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // env.NVIDIA_API_KEY is guaranteed defined here — the exported
      // nvidiaChatCompletion below checks it's configured before this
      // function is ever called, same gate sendEmail applies for
      // RESEND_API_KEY.
      Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.NVIDIA_MODEL,
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.toolChoice ?? 'auto',
      // Deterministic-leaning, not random — this call's whole job is to
      // pick ONE of a small allowlisted set of functions consistently for
      // the same question, not to be creative.
      temperature: 0,
    }),
  });

  if (!response.ok) {
    // Read the body BEFORE throwing, same as integrations/email/client.ts's
    // rawSendEmail — response.json().catch(() => null) (the previous version
    // here) silently discards the raw body on a non-JSON response (e.g. a
    // raw 5xx from an edge/proxy layer), losing the only place the real
    // reason exists. response.text() first, then best-effort JSON.parse,
    // keeping the raw text as a fallback.
    const rawBody = await response.text();
    let parsedBody: unknown = rawBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      // Not JSON — parsedBody stays the raw text.
    }

    const nvidiaMessage = extractNvidiaErrorMessage(
      parsedBody,
      rawBody || response.statusText,
    );

    // status/statusText/body assigned onto the Error AFTER construction —
    // these ARE enumerable own properties (unlike the engine-built-in
    // message/stack), so they survive once this propagates up through
    // withResilience's `{ cause: lastError }` — see that function's own
    // comment.
    const error = new Error(
      `NVIDIA request failed: ${response.status} ${response.statusText} — ${nvidiaMessage}`,
    ) as Error & { status: number; statusText: string; body: unknown };
    error.status = response.status;
    error.statusText = response.statusText;
    error.body = parsedBody;
    throw error;
  }

  return (await response.json()) as NvidiaChatCompletionResponse;
}

// Public entrypoint — mirrors integrations/email/client.ts's sendEmail:
// check configured -> check circuit -> withResilience -> record outcome.
// Never lets a raw fetch/JSON/NVIDIA error escape; only ever throws
// ServiceUnavailableError (an AppError), per CLAUDE.md non-negotiable #6.
export async function nvidiaChatCompletion(
  params: NvidiaChatCompletionParams,
): Promise<NvidiaChatCompletionResponse> {
  if (!env.NVIDIA_API_KEY) {
    throw new ServiceUnavailableError(
      'NVIDIA_API_KEY is not configured — the chatbot is disabled',
    );
  }

  if (isCircuitOpen()) {
    throw new ServiceUnavailableError(
      'NVIDIA is temporarily unavailable (circuit breaker open) — try again shortly',
    );
  }

  try {
    const result = await withResilience('POST /chat/completions', () =>
      rawChatCompletion(params),
    );
    recordSuccess();
    return result;
  } catch (err) {
    recordFailure();
    throw err;
  }
}
