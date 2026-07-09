import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../logger';
import { AppError, ValidationError } from '../shared/errors/app-error';
import { ErrorCode } from '../shared/errors/error-codes';
import type { ApiErrorResponse } from '../shared/types/api-response';

const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred. Please try again later.';
const GENERIC_CLIENT_ERROR_MESSAGE = 'The request could not be processed.';

// Fastify's own errors (malformed JSON bodies, payload-too-large, etc.) are
// plain Errors with a numeric statusCode property, not AppError instances —
// but they're still legitimate 4xx client faults, not server faults, and
// shouldn't get force-mapped to a generic 500.
function getClientErrorStatusCode(error: Error): number | undefined {
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
    ? statusCode
    : undefined;
}

export default fp(async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: error.errorCode,
          message: error.message,
          // Field-level Zod details are only ever surfaced for ValidationError —
          // every other AppError subclass keeps the plain { code, message } shape.
          ...(error instanceof ValidationError ? { details: error.details } : {}),
        },
      };
      reply.status(error.statusCode).send(response);
      return;
    }

    const clientErrorStatusCode = getClientErrorStatusCode(error);

    if (clientErrorStatusCode !== undefined) {
      // A 400 from malformed client input isn't the same severity as a real
      // unhandled 500 — warn, not error, so alerting/log-severity filters
      // don't treat "someone sent bad JSON" as an incident.
      logger.warn(
        { err: error, reqId: request.id, method: request.method, url: request.url },
        'Client error',
      );

      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: GENERIC_CLIENT_ERROR_MESSAGE,
        },
      };
      reply.status(clientErrorStatusCode).send(response);
      return;
    }

    logger.error(
      { err: error, reqId: request.id, method: request.method, url: request.url },
      'Unhandled error',
    );

    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: GENERIC_ERROR_MESSAGE,
      },
    };
    reply.status(500).send(response);
  });
});
