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

// path MUST match the actual mounted route prefix (app.ts's
// API_PREFIX = '/api/v1', so the real endpoints are /api/v1/auth/refresh
// and /api/v1/auth/logout) — a browser only attaches a cookie to a request
// whose path starts with the cookie's own `path` attribute. This was
// previously '/auth', which never matches '/api/v1/auth/...' at all, so
// the cookie was silently never sent to either endpoint: readRefreshTokenCookie
// always saw it as missing, meaning POST /auth/refresh 401'd unconditionally
// and clearCookie on logout never matched the real stored cookie either.
// Confirmed live via a corrupted-access-token test that the refresh call
// itself 401'd with "Missing refresh token cookie" even though login had
// just set the cookie moments before.
const REFRESH_COOKIE_OPTIONS: CookieSerializeOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
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

  const response: ApiSuccessResponse<{ accessToken: string; user: LoginResultUser }> = {
    success: true,
    data: { accessToken: result.accessToken, user: result.user },
  };
  reply.status(200).send(response);
}

async function logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];
  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  // Must match REFRESH_COOKIE_OPTIONS.path exactly — clearing a cookie is
  // itself just setting an expired cookie with the same name/path/domain;
  // a mismatched path here would silently fail to clear the real cookie,
  // same bug class as above.
  reply.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api/v1/auth' });
  reply.status(204).send();
}

export const authController = { login, refresh, logout };
