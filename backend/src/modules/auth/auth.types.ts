import type { JWT_TOKEN_TYPE } from '../../config/constants';

export interface JwtAccessPayload {
  sub: string;
  email: string;
  type: typeof JWT_TOKEN_TYPE.ACCESS;
  activeCollegeId: string | null;
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
  type: typeof JWT_TOKEN_TYPE.REFRESH;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  // Optional: a user with zero or multiple college-scoped role assignments
  // has no unambiguous active college yet. See auth.service.ts's
  // resolveActiveCollegeId() — the users/organization module will need an
  // explicit "switch college" flow to let a user pick when this is null.
  activeCollegeId?: string | null;
}

export interface LoginResultUser extends AuthenticatedUser {
  fullName: string;
  roles: string[];
}

export interface LoginResult extends TokenPair {
  user: LoginResultUser;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
