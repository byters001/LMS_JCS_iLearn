import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JWT_TOKEN_TYPE } from '../config/constants';
import { env } from '../config/env';
import { UnauthorizedError } from '../shared/errors/app-error';
import type { AuthenticatedUser, JwtAccessPayload } from '../modules/auth/auth.types';

const JWT_ALGORITHM = 'HS256';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }
  return authorizationHeader.slice('Bearer '.length).trim();
}

export default fp(async function authenticatePlugin(fastify: FastifyInstance) {
  fastify.decorate(
    'authenticate',
    async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
      const token = extractBearerToken(request.headers.authorization);

      let payload: JwtAccessPayload;
      try {
        payload = jwt.verify(token, env.JWT_SECRET, {
          algorithms: [JWT_ALGORITHM],
        }) as JwtAccessPayload;
      } catch {
        throw new UnauthorizedError('Invalid or expired access token');
      }

      if (payload.type !== JWT_TOKEN_TYPE.ACCESS) {
        throw new UnauthorizedError('Invalid or expired access token');
      }

      const user: AuthenticatedUser = {
        id: payload.sub,
        email: payload.email,
        activeCollegeId: payload.activeCollegeId,
      };
      request.user = user;
    },
  );
});
