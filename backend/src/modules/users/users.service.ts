import argon2 from 'argon2';
import { STORAGE_BUCKET, storageService } from '../../integrations/supabase';
import { permissionCache } from '../../rbac/permission-cache';
import type { UserRoleAssignment } from '../../rbac/role-assignments';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error';
import type { User } from '../../db/types';
import type {
  AssignRoleInput,
  CreateFacultyUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from './users.schema';
import type { ListUsersResult, SafeUser } from './users.types';
import { usersRepository } from './users.repository';

function avatarPath(userId: string): string {
  return `${userId}/avatar`;
}

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
    isActive: query.isActive,
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

// Returns undefined rather than throwing — callers use this for a
// does-this-email-already-exist pre-check (students.service.ts's bulk
// creation), where "not found" is the expected, non-error case, not a
// NotFoundError-worthy failure.
async function findByEmail(email: string): Promise<SafeUser | undefined> {
  const user = await usersRepository.findByEmail(email);
  return user ? toSafeUser(user) : undefined;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
}

// See users.repository.ts's createUser comment for why this takes an
// already-hashed password rather than hashing one itself.
async function createUser(input: CreateUserInput, createdBy: string): Promise<SafeUser> {
  const existing = await usersRepository.findByEmail(input.email);
  if (existing) {
    throw new ConflictError('A user with this email already exists');
  }

  const user = await usersRepository.createUser({ ...input, createdBy });
  return toSafeUser(user);
}

async function findRoleBySlug(slug: string): Promise<{ id: string }> {
  const role = await usersRepository.findRoleBySlug(slug);
  if (!role) {
    throw new NotFoundError(`Role '${slug}' not found`);
  }
  return role;
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

async function uploadAvatar(userId: string, file: Buffer, contentType: string): Promise<string> {
  const user = await usersRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // upsert: true — re-uploading a new avatar replaces the old one at the
  // same path rather than accumulating files. This is exactly the upsert
  // case the upload() signature was extended for in Phase 6.
  await storageService.upload(STORAGE_BUCKET.AVATARS, avatarPath(userId), file, contentType, true);

  const { url } = storageService.getPublicUrl(STORAGE_BUCKET.AVATARS, avatarPath(userId));

  await usersRepository.updateAvatarUrl(userId, url);

  return url;
}

async function removeAvatar(userId: string): Promise<void> {
  const user = await usersRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  await storageService.delete(STORAGE_BUCKET.AVATARS, avatarPath(userId));
  await usersRepository.updateAvatarUrl(userId, null);
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

// Faculty account creation for the Admin's Faculty management UI — a real
// gap this codebase had (no POST /users at all). Deliberately composed from
// the two EXISTING steps (createUser, then assignRole) rather than one new
// combined repository write: role assignment already happens as a separate
// step everywhere else in this codebase (see assignRole above, and
// students.service.ts's createStudentsInBatch, which does the exact same
// createUser-then-assignRole sequence for students) — this isn't wrapped
// in one DB transaction either, matching that same established, stated
// limitation (no service in this codebase accepts an injectable
// transaction client today). collegeId's existence is validated by the
// CONTROLLER (organizationService.findCollegeById), not here — importing
// organizationService from this file would create a circular dependency,
// since organization.service.ts already imports usersService.
async function createFacultyUser(
  input: CreateFacultyUserInput,
  createdBy: string,
): Promise<SafeUser> {
  const facultyRole = await findRoleBySlug('faculty');
  const passwordHash = await argon2.hash(input.password);

  const user = await createUser(
    { email: input.email, passwordHash, fullName: input.fullName },
    createdBy,
  );

  await assignRole(user.id, { roleId: facultyRole.id, collegeId: input.collegeId }, createdBy);

  return user;
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
  findByEmail,
  createUser,
  createFacultyUser,
  findRoleBySlug,
  update,
  uploadAvatar,
  removeAvatar,
  assignRole,
  revokeRole,
  resolvePermissionsForUser,
};
