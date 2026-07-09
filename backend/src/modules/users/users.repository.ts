import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { permissions, rolePermissions, roles, userRoles, users } from '../../db/schema/identity.schema';
import type { User, UserRole } from '../../db/types';
import { getRoleAssignmentsForUser } from '../../rbac/role-assignments';

export interface ListUsersParams {
  page: number;
  pageSize: number;
  roleSlug?: string;
  collegeId?: string;
}

export interface ListUsersResult {
  items: User[];
  total: number;
}

function buildListWhere(roleSlug?: string, collegeId?: string) {
  const conditions = [isNull(users.deletedAt)];
  if (roleSlug) conditions.push(eq(roles.slug, roleSlug));
  if (collegeId) conditions.push(eq(userRoles.collegeId, collegeId));
  return and(...conditions);
}

async function list(params: ListUsersParams): Promise<ListUsersResult> {
  const { page, pageSize, roleSlug, collegeId } = params;
  const offset = (page - 1) * pageSize;
  const where = buildListWhere(roleSlug, collegeId);

  const [items, totalRows] = await Promise.all([
    db
      .selectDistinct({ user: users })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(roles.id, userRoles.roleId))
      .where(where)
      .orderBy(asc(users.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(distinct ${users.id})` })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(roles.id, userRoles.roleId))
      .where(where),
  ]);

  return {
    items: items.map((row) => row.user),
    total: Number(totalRows[0]?.count ?? 0),
  };
}

async function findById(id: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return user;
}

export interface UpdateUserData {
  fullName?: string;
  isActive?: boolean;
}

// Deliberately narrow: passwordHash is never accepted here. Password changes
// belong to a dedicated auth/credentials flow, not general profile updates.
async function update(id: string, data: UpdateUserData): Promise<User | undefined> {
  const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
  return updated;
}

// Deliberately separate from update(): that one is driven by a validated
// PATCH body (UpdateUserData is fullName/isActive only, by design — see the
// comment above it). avatar_url has a different provenance entirely — it's
// derived server-side from a successful storage upload, never user-supplied
// JSON — so it gets its own narrow, single-purpose write path instead of
// being folded into the general-purpose update().
async function updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<void> {
  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
}

export interface AssignRoleData {
  userId: string;
  roleId: string;
  collegeId: string | null;
  assignedBy: string | null;
}

async function roleExists(roleId: string): Promise<boolean> {
  const [row] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).limit(1);
  return Boolean(row);
}

async function assignRole(data: AssignRoleData): Promise<UserRole> {
  const [assignment] = await db
    .insert(userRoles)
    .values({
      userId: data.userId,
      roleId: data.roleId,
      collegeId: data.collegeId,
      assignedBy: data.assignedBy,
    })
    .returning();
  return assignment;
}

// Hard delete: user_roles has no deleted_at column in schema.sql (unlike
// users/colleges/etc.), so soft-delete isn't representable without inventing
// a column that isn't in the reference schema. A role assignment is just
// join-table membership, not an audit-worthy entity in its own right —
// history of who-assigned-what-when should live in an audit log (see
// audit_logs in schema.sql), not be inferred from soft-deleted rows here.
async function revokeRole(
  userId: string,
  roleId: string,
  collegeId: string | null,
): Promise<boolean> {
  const conditions = [eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)];
  conditions.push(collegeId === null ? isNull(userRoles.collegeId) : eq(userRoles.collegeId, collegeId));

  const deleted = await db
    .delete(userRoles)
    .where(and(...conditions))
    .returning({ id: userRoles.id });
  return deleted.length > 0;
}

// Flattened permission keys granted to userId, scoped to collegeId: global
// (college_id IS NULL) role assignments always apply; college-scoped role
// assignments only apply when they match the requested collegeId. Feeds
// permissionCache via users.service.ts's resolvePermissionsForUser().
async function getPermissionKeysForUser(
  userId: string,
  collegeId: string | null,
): Promise<string[]> {
  const scopeCondition =
    collegeId === null
      ? isNull(userRoles.collegeId)
      : or(isNull(userRoles.collegeId), eq(userRoles.collegeId, collegeId));

  const rows = await db
    .select({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(userRoles.userId, userId), scopeCondition));

  return [...new Set(rows.map((row) => row.key))];
}

export const usersRepository = {
  list,
  findById,
  update,
  updateAvatarUrl,
  roleExists,
  assignRole,
  revokeRole,
  getRoleAssignments: getRoleAssignmentsForUser,
  getPermissionKeysForUser,
};
