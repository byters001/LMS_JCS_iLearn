import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { JWT_TOKEN_TYPE } from '../../config/constants';
import { env } from '../../config/env';
import { redisClient } from '../../redis/client';
import { revokedRefreshTokenKey } from '../../redis/keys';
import type { UserRoleAssignment } from '../../rbac/role-assignments';
import { UnauthorizedError } from '../../shared/errors/app-error';
import { parseDurationToSeconds } from '../../shared/utils/date.util';
import { usersService } from '../users/users.service';
import { authRepository } from './auth.repository';
import type { LoginInput } from './auth.schema';
import type {
  JwtAccessPayload,
  JwtRefreshPayload,
  LoginResult,
  LoginResultUser,
  TokenPair,
} from './auth.types';

const JWT_ALGORITHM = 'HS256';

// A revoked jti only needs to be remembered for as long as the refresh token
// itself would still be valid — once JWT_REFRESH_EXPIRY has elapsed, jwt.verify
// already rejects the token on expiry, so the revocation record is moot.
// Letting Redis expire the key itself means there's nothing to clean up.
async function revokeRefreshTokenId(jti: string): Promise<void> {
  await redisClient.set(
    revokedRefreshTokenKey(jti),
    '1',
    'EX',
    parseDurationToSeconds(env.JWT_REFRESH_EXPIRY),
  );
}

async function isRefreshTokenRevoked(jti: string): Promise<boolean> {
  const exists = await redisClient.exists(revokedRefreshTokenKey(jti));
  return exists === 1;
}

// A user's active college can only be resolved unambiguously here when they
// have exactly one role and it's college-scoped. Zero roles, a global role,
// or multiple college-scoped roles all fall back to null.
// TODO(users/organization module): replace this heuristic with an explicit
// "switch college" flow once a user can pick among multiple college
// contexts themselves.
function resolveActiveCollegeId(assignments: UserRoleAssignment[]): string | null {
  if (assignments.length === 1 && assignments[0].collegeId !== null) {
    return assignments[0].collegeId;
  }
  return null;
}

function signAccessToken(userId: string, email: string, activeCollegeId: string | null): string {
  const payload: JwtAccessPayload = {
    sub: userId,
    email,
    type: JWT_TOKEN_TYPE.ACCESS,
    activeCollegeId,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.JWT_ACCESS_EXPIRY,
  });
}

function signRefreshToken(userId: string): string {
  const payload: JwtRefreshPayload = {
    sub: userId,
    jti: randomUUID(),
    type: JWT_TOKEN_TYPE.REFRESH,
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.JWT_REFRESH_EXPIRY,
  });
}

function issueTokenPair(userId: string, email: string, activeCollegeId: string | null): TokenPair {
  return {
    accessToken: signAccessToken(userId, email, activeCollegeId),
    refreshToken: signRefreshToken(userId),
  };
}

async function verifyRefreshToken(token: string): Promise<JwtRefreshPayload> {
  let payload: JwtRefreshPayload;
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as JwtRefreshPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  if (payload.type !== JWT_TOKEN_TYPE.REFRESH) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  if (await isRefreshTokenRevoked(payload.jti)) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  return payload;
}

async function login(input: LoginInput): Promise<LoginResult> {
  const user = await authRepository.findUserByEmail(input.email);

  if (!user || !user.isActive || user.deletedAt) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const passwordMatches = await argon2.verify(user.passwordHash, input.password);
  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const assignments = await authRepository.getRoleAssignmentsForUser(user.id);
  const activeCollegeId = resolveActiveCollegeId(assignments);

  // Without this, requirePermission() denies everything: the cache is
  // otherwise never populated until Phase 5's real Redis wiring adds a
  // background/periodic resolution path.
  await usersService.resolvePermissionsForUser(user.id, activeCollegeId);

  const loginUser: LoginResultUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: assignments.map((assignment) => assignment.role.slug),
    activeCollegeId,
  };

  return { ...issueTokenPair(user.id, user.email, activeCollegeId), user: loginUser };
}

// Returns the same { accessToken, refreshToken, user } shape as login() —
// the frontend's boot-time silent refresh (CLAUDE1.md's auth flow) needs
// `user` (roles, activeCollegeId) to land on the right role-home after a
// hard reload, since the in-memory auth store has nothing to read yet at
// that point. Refresh alone (just a new accessToken) was enough for the
// existing reactive 401-retry path, which already has `user` in the store
// from the login that started the session — but not for this boot case.
async function refresh(refreshToken: string): Promise<LoginResult> {
  const payload = await verifyRefreshToken(refreshToken);

  const user = await authRepository.findUserById(payload.sub);
  if (!user || !user.isActive || user.deletedAt) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Rotate: this refresh token can never be redeemed again.
  await revokeRefreshTokenId(payload.jti);

  const assignments = await authRepository.getRoleAssignmentsForUser(user.id);
  const activeCollegeId = resolveActiveCollegeId(assignments);

  const refreshedUser: LoginResultUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: assignments.map((assignment) => assignment.role.slug),
    activeCollegeId,
  };

  return { ...issueTokenPair(user.id, user.email, activeCollegeId), user: refreshedUser };
}

async function logout(refreshToken: string): Promise<void> {
  let payload: JwtRefreshPayload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as JwtRefreshPayload;
  } catch {
    // Token already invalid/expired — logout is idempotent either way.
    return;
  }

  // Deliberately outside the try/catch above: a Redis failure here must not
  // be swallowed by the "token already invalid" path, or a client would be
  // told logout succeeded while the refresh token stays valid.
  await revokeRefreshTokenId(payload.jti);
}

export const authService = { login, refresh, logout };
