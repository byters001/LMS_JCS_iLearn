import type { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/app-error';
import { permissionCache } from './permission-cache';
import type { PermissionKey } from './types';

export function requirePermission(permissionKey: PermissionKey) {
  return async function requirePermissionPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const permissionKeys =
      (await permissionCache.get(request.user.id, request.user.activeCollegeId ?? null)) ?? [];

    if (!permissionKeys.includes(permissionKey)) {
      throw new ForbiddenError(`Missing required permission: ${permissionKey}`);
    }
  };
}
