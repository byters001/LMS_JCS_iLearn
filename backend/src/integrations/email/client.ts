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

  throw new ServiceUnavailableError(
    `Resend request "${operationName}" failed after ${MAX_RETRY_ATTEMPTS} attempts`,
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
    throw new Error(`Resend request failed: ${response.status} ${response.statusText}`);
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
