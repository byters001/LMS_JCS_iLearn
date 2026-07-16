import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { LOGIN_RATE_LIMIT_CONFIG } from '../../plugins/rate-limit.plugin';
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
  // Rate-limited tighter than the app-wide default (rate-limit.plugin.ts's
  // GLOBAL_RATE_LIMIT_MAX) — login is the one unauthenticated endpoint here
  // with a real brute-force motive, and has no other defense.
  fastify.post<{ Body: LoginInput }>(
    '/auth/login',
    {
      preValidation: validateBody(loginSchema),
      config: { rateLimit: LOGIN_RATE_LIMIT_CONFIG },
    },
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
