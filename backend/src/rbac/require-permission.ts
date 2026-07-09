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

// Added for the question-bank module: schema.sql seeds questions.manage
// ("own/college") and questions.manage_global as two independent manage-tier
// keys for the same resource — the first time this codebase has had more
// than one manage key per module. requirePermission() only checks a single
// key, so a route that should accept either needs OR logic; this is that,
// kept as a separate additive export rather than changing
// requirePermission()'s existing single-key behavior/signature that every
// other module already relies on.
export function requireAnyPermission(permissionKeys: PermissionKey[]) {
  return async function requireAnyPermissionPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const userPermissionKeys =
      (await permissionCache.get(request.user.id, request.user.activeCollegeId ?? null)) ?? [];

    if (!permissionKeys.some((key) => userPermissionKeys.includes(key))) {
      throw new ForbiddenError(`Missing required permission: one of [${permissionKeys.join(', ')}]`);
    }
  };
}
