import { permissionCache } from '../../rbac/permission-cache';
import type { UserRoleAssignment } from '../../rbac/role-assignments';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error';
import type { User } from '../../db/types';
import type { AssignRoleInput, ListUsersQuery, UpdateUserInput } from './users.schema';
import type { ListUsersResult, SafeUser } from './users.types';
import { usersRepository } from './users.repository';

function toSafeUser(user: User): SafeUser {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

async function list(query: ListUsersQuery): Promise<ListUsersResult> {
  const { items, total } = await usersRepository.list({
    page: query.page,
    pageSize: query.pageSize,
    roleSlug: query.roleSlug,
    collegeId: query.collegeId,
  });

  return {
    items: items.map(toSafeUser),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function findById(id: string): Promise<SafeUser> {
  const user = await usersRepository.findById(id);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return toSafeUser(user);
}

async function update(id: string, input: UpdateUserInput): Promise<SafeUser> {
  const existing = await usersRepository.findById(id);
  if (!existing) {
    throw new NotFoundError('User not found');
  }

  const updated = await usersRepository.update(id, input);
  if (!updated) {
    throw new NotFoundError('User not found');
  }

  return toSafeUser(updated);
}

async function assignRole(
  userId: string,
  input: AssignRoleInput,
  assignedBy: string,
): Promise<UserRoleAssignment> {
  const user = await usersRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const roleIsValid = await usersRepository.roleExists(input.roleId);
  if (!roleIsValid) {
    throw new NotFoundError('Role not found');
  }

  const collegeId = input.collegeId ?? null;

  const existingAssignments = await usersRepository.getRoleAssignments(userId);
  const alreadyAssigned = existingAssignments.some(
    (assignment) => assignment.role.id === input.roleId && assignment.collegeId === collegeId,
  );
  if (alreadyAssigned) {
    throw new ConflictError('User already has this role for the given college');
  }

  await usersRepository.assignRole({
    userId,
    roleId: input.roleId,
    collegeId,
    assignedBy,
  });

  // Prevents a stale cached permission set from persisting until TTL expiry
  // after a role grant/revoke — see permissionCache's own TTL note.
  await permissionCache.invalidate(userId, collegeId);
  await resolvePermissionsForUser(userId, collegeId);

  const assignmentsAfterInsert = await usersRepository.getRoleAssignments(userId);
  const assignment = assignmentsAfterInsert.find(
    (candidate) => candidate.role.id === input.roleId && candidate.collegeId === collegeId,
  );
  if (!assignment) {
    throw new NotFoundError('Role assignment could not be found after creation');
  }

  return assignment;
}

async function revokeRole(userId: string, roleId: string, collegeId: string | null): Promise<void> {
  const user = await usersRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const revoked = await usersRepository.revokeRole(userId, roleId, collegeId);
  if (!revoked) {
    throw new NotFoundError('Role assignment not found');
  }

  await permissionCache.invalidate(userId, collegeId);
}

// permission-cache.ts has nothing populating it in earlier phases, so
// requirePermission() denies everything by default. This resolves a user's
// permissions fresh from role_permissions/permissions and writes them
// through to the cache. Called at the end of auth.service.ts's login() —
// see that file for why it's a cross-module service call rather than a
// duplicated query.
async function resolvePermissionsForUser(
  userId: string,
  collegeId: string | null,
): Promise<string[]> {
  const permissionKeys = await usersRepository.getPermissionKeysForUser(userId, collegeId);
  await permissionCache.set(userId, collegeId, permissionKeys);
  return permissionKeys;
}

export const usersService = {
  list,
  findById,
  update,
  assignRole,
  revokeRole,
  resolvePermissionsForUser,
};
