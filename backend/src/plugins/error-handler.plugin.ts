import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../logger';
import { AppError, ValidationError } from '../shared/errors/app-error';
import { ErrorCode } from '../shared/errors/error-codes';
import type { ApiErrorResponse } from '../shared/types/api-response';

const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred. Please try again later.';

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
