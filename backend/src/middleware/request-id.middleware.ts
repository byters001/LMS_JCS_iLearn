import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../logger';

const REQUEST_ID_HEADER = 'x-request-id';

function extractIncomingRequestId(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

// onRequest hook (see plugins/request-context.plugin.ts): propagates a
// caller-supplied X-Request-Id if present, otherwise mints one. Overrides
// Fastify's own auto-generated request.id (a monotonic counter by default)
// so logs, the response header, and any caller-supplied trace id all agree
// on the same value. Every subsequent log line for this request goes
// through request.log — a Pino child with requestId baked into its
// bindings — instead of the shared logger singleton directly.
export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const requestId = extractIncomingRequestId(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();

  request.id = requestId;
  request.log = logger.child({ requestId });
  reply.header('X-Request-Id', requestId);
}
