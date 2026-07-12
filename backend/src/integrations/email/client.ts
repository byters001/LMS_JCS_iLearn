import { env } from '../../config/env';
import { logger } from '../../logger';
import { ServiceUnavailableError } from '../../shared/errors/app-error';
import type { SendEmailParams } from './email.types';

const RESEND_API_BASE_URL = 'https://api.resend.com';

const CALL_TIMEOUT_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 200;
const MAX_RETRY_DELAY_MS = 2000;

const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000;

// Identical shape to integrations/judge0/client.ts's own
// retryDelay/sleep/withTimeout/withResilience — deliberately duplicated
// here rather than extracted into a shared helper. judge0/client.ts's own
// comment notes integrations/supabase/storage.ts and redis/client.ts each
// already keep their own copy of this same shape; this is that same
// established (no-shared-abstraction) precedent, not a new one.
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
      reject(new Error(`Resend call timed out after ${timeoutMs}ms`));
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

  // lastError.message is folded into THIS error's own message (not just
  // left inside `details`) because a native Error's message/stack are
  // non-enumerable own properties — JSON.stringify(lastError) (and
  // therefore JSON.stringify({ cause: lastError }), and pino's own
  // serialization of nested, non-top-level error objects inside `details`)
  // silently produces `{}`, which is exactly how this bug manifested
  // ("cause: {}" — confirmed by testing `JSON.stringify({cause: new
  // Error('x')})` directly: it really does yield `{"cause":{}}`). Custom
  // properties assigned onto an Error instance afterward (rawSendEmail's
  // .status/.statusText/.body below) ARE enumerable and survive
  // JSON.stringify fine — only the engine-built-in message/stack don't —
  // so `details: { cause: lastError }` below now actually carries useful
  // data too, this line is just defense-in-depth so the real reason is
  // visible even from the top-level message alone.
  const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ServiceUnavailableError(
    `Resend request "${operationName}" failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastErrorMessage}`,
    { cause: lastError },
  );
}

// Circuit breaker state — module-level singleton, same reasoning as
// judge0/client.ts's: Resend is a third-party service that can go down or
// rate-limit independently of this backend; short-circuiting avoids piling
// up 5s-timeout retries against a provider already known to be failing.
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
      'Resend circuit breaker opened — short-circuiting further calls for 30s',
    );
  }
}

interface ResendSendResponse {
  id: string;
}

// Resend's own error responses are JSON, e.g.
// {"statusCode":422,"name":"validation_error","message":"The `from` address
// is not verified"} — that `message` field is the actual, actionable
// diagnostic. The previous version of rawSendEmail below threw
// `new Error(\`Resend request failed: ${status} ${statusText}\`)` WITHOUT
// ever reading the response body at all — response.statusText is often
// just the generic HTTP reason phrase (e.g. "Unprocessable Entity"), not
// Resend's own message, so that body was the only place the real reason
// ever existed, and it was being discarded before anyone could see it.
interface ResendErrorBody {
  statusCode?: number;
  name?: string;
  message?: string;
}

function extractResendErrorMessage(body: unknown, fallback: string): string {
  if (body !== null && typeof body === 'object' && 'message' in body) {
    const message = (body as ResendErrorBody).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return fallback;
}

// Raw fetch against Resend's REST API directly, no `resend` SDK dependency
// — same "no SDK, plain fetch wrapped in the resilience helpers above"
// shape judge0/client.ts already uses (Judge0 has no official Node SDK
// either). Picked deliberately over adding the `resend` package: the
// resilience pattern this file is required to reuse (timeout via
// Promise.race, retry, circuit breaker) is built entirely around wrapping
// a raw fetch call — bolting that onto an SDK's own request handling would
// fight the SDK rather than reuse the established pattern.
async function rawSendEmail(params: SendEmailParams): Promise<ResendSendResponse> {
  const response = await fetch(`${RESEND_API_BASE_URL}/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM_ADDRESS,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    // Read the body BEFORE throwing — response.text() still works on a
    // non-ok response; the previous version never called it at all. Resend
    // doesn't always return JSON (e.g. a raw 5xx from an edge/proxy layer
    // could be plain text or HTML), so JSON.parse is attempted and the raw
    // text is kept as a fallback rather than assumed.
    const rawBody = await response.text();
    let parsedBody: unknown = rawBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      // Not JSON — parsedBody stays the raw text.
    }

    const resendMessage = extractResendErrorMessage(
      parsedBody,
      rawBody || `${response.status} ${response.statusText}`,
    );

    // status/statusText/body are assigned onto the Error AFTER
    // construction — these ARE enumerable own properties (unlike the
    // engine-built-in message/stack), so they survive JSON.stringify
    // correctly once this propagates up through withResilience's
    // `{ cause: lastError }` — see that function's own comment for why
    // that distinction is exactly what caused "cause: {}" previously.
    const error = new Error(
      `Resend request failed: ${response.status} ${response.statusText} — ${resendMessage}`,
    ) as Error & { status: number; statusText: string; body: unknown };
    error.status = response.status;
    error.statusText = response.statusText;
    error.body = parsedBody;
    throw error;
  }

  return (await response.json()) as ResendSendResponse;
}

// The only exported entrypoint — resilience-wrapped exactly like judge0's
// judge0Post: timeout + bounded retry + circuit breaker, matching
// integrations/judge0/client.ts's judge0Request structure 1:1. Throws
// ServiceUnavailableError (an AppError, per CLAUDE.md non-negotiable #6)
// on exhausted retries, an open circuit, or a missing RESEND_API_KEY.
//
// This function throwing is NOT the fire-and-forget boundary — it's
// notifications.service.ts's job (the only caller) to catch this and never
// let it propagate or roll back the triggering action. See that file's
// module comment for where the actual "never breaks the caller" guarantee
// is enforced.
export async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new ServiceUnavailableError(
      'RESEND_API_KEY is not configured — email sending is disabled',
    );
  }

  if (isCircuitOpen()) {
    throw new ServiceUnavailableError(
      'Resend is temporarily unavailable (circuit breaker open) — try again shortly',
    );
  }

  try {
    await withResilience(`POST /emails to ${params.to}`, () => rawSendEmail(params));
    recordSuccess();
  } catch (err) {
    recordFailure();
    throw err;
  }
}
