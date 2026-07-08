import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../../shared/errors/app-error';
import { authController } from './auth.controller';
import { loginSchema, logoutSchema, refreshSchema, type LoginInput } from './auth.schema';

function validateBody(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    request.body = parsed.data;
  };
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: LoginInput }>(
    '/auth/login',
    { preValidation: validateBody(loginSchema) },
    authController.login,
  );

  // Refresh token travels via httpOnly cookie, not the body — the empty
  // schema just guards against an unexpected/malformed body being sent.
  fastify.post(
    '/auth/refresh',
    { preValidation: validateBody(refreshSchema) },
    authController.refresh,
  );

  fastify.post(
    '/auth/logout',
    { preValidation: validateBody(logoutSchema) },
    authController.logout,
  );
}

export default authRoutes;
