import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { REFRESH_TOKEN_COOKIE_NAME } from '../../config/constants';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { parseDurationToSeconds } from '../../shared/utils/date.util';
import { authService } from './auth.service';
import type { LoginInput } from './auth.schema';
import type { LoginResultUser } from './auth.types';

const REFRESH_COOKIE_OPTIONS: CookieSerializeOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/auth',
};

function setRefreshTokenCookie(reply: FastifyReply, refreshToken: string): void {
  reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...REFRESH_COOKIE_OPTIONS,
    maxAge: parseDurationToSeconds(env.JWT_REFRESH_EXPIRY),
  });
}

function readRefreshTokenCookie(request: FastifyRequest): string {
  const token = request.cookies[REFRESH_TOKEN_COOKIE_NAME];
  if (!token) {
    throw new UnauthorizedError('Missing refresh token cookie');
  }
  return token;
}

async function login(
  request: FastifyRequest<{ Body: LoginInput }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await authService.login(request.body);

  setRefreshTokenCookie(reply, result.refreshToken);

  const response: ApiSuccessResponse<{ accessToken: string; user: LoginResultUser }> = {
    success: true,
    data: { accessToken: result.accessToken, user: result.user },
  };
  reply.status(200).send(response);
}

async function refresh(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const refreshToken = readRefreshTokenCookie(request);
  const result = await authService.refresh(refreshToken);

  setRefreshTokenCookie(reply, result.refreshToken);

  const response: ApiSuccessResponse<{ accessToken: string }> = {
    success: true,
    data: { accessToken: result.accessToken },
  };
  reply.status(200).send(response);
}

async function logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];
  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  reply.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/auth' });
  reply.status(204).send();
}

export const authController = { login, refresh, logout };
