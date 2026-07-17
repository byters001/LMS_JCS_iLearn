import type { FastifyReply, FastifyRequest } from 'fastify';
import { usersService } from '../modules/users/users.service';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/app-error';
import { permissionCache } from './permission-cache';
import type { PermissionKey } from './types';

// A cache miss here means either "never populated" or "TTL-expired" — not
// "this user has no permissions." Denying outright on a miss caused the
// live super_admin-403-after-long-idle-session bug: a stale/absent cache
// entry read as zero permissions instead of triggering a real lookup.
// Falling back to resolvePermissionsForUser() re-derives the permission set
// from role_permissions/permissions (the source of truth) and repopulates
// the cache before the check runs, so a valid grant is never denied just
// because Redis's copy expired. This does NOT weaken security: a revoked
// role is removed from the DB at revoke time (users.service.ts's
// revokeRole), so a fresh resolve for a revoked user still comes back
// without the permission — it's re-checked against the real grant, not
// skipped.
async function getPermissionKeysForRequest(request: FastifyRequest): Promise<PermissionKey[]> {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }

  const userId = request.user.id;
  const collegeId = request.user.activeCollegeId ?? null;

  const cached = await permissionCache.get(userId, collegeId);
  if (cached !== null) {
    return cached;
  }

  return usersService.resolvePermissionsForUser(userId, collegeId);
}

export function requirePermission(permissionKey: PermissionKey) {
  return async function requirePermissionPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const permissionKeys = await getPermissionKeysForRequest(request);

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
    const userPermissionKeys = await getPermissionKeysForRequest(request);

    if (!permissionKeys.some((key) => userPermissionKeys.includes(key))) {
      throw new ForbiddenError(`Missing required permission: one of [${permissionKeys.join(', ')}]`);
    }
  };
}
