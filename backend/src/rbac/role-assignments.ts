import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { roles, userRoles } from '../db/schema/identity.schema';
import type { Role } from '../db/types';

// Shared by modules/auth (login/refresh needs a user's roles to resolve an
// active college) and modules/users (role assignment/listing needs the same
// join). Lives here rather than in either module's repository so neither
// module has to import the other's repository directly, which would break
// CLAUDE.md's "never another module's repository" boundary rule.
export interface UserRoleAssignment {
  role: Role;
  collegeId: string | null;
}

export async function getRoleAssignmentsForUser(userId: string): Promise<UserRoleAssignment[]> {
  return db
    .select({ role: roles, collegeId: userRoles.collegeId })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
}

// Shared by every module that needs to distinguish "this specific caller is
// super_admin" from "this caller merely holds a permission super_admin also
// happens to hold" — assessments.create, questions.manage, and analytics.
// view are all held by BOTH super_admin and faculty (schema.sql's
// role_permissions seed), so the shared permission key itself can never
// answer this question; only role identity can. Queried fresh against
// user_roles every call, not permissionCache — permission KEYS never carry
// role SLUG identity (confirmed: rbac/permission-cache.ts stores
// PermissionKey[], never a role). This deliberately replaces the
// `activeCollegeId === null` heuristic several call sites used to lean on
// as a super_admin proxy (analytics.service.ts's assertCanAccessBatch,
// chatbot.controller.ts's requireContext) — that heuristic breaks for any
// user with more than one role assignment, super_admin or not, since
// auth.service.ts's resolveActiveCollegeId returns null for THAT reason
// too, not only for a genuine super_admin grant.
export async function userHasRole(userId: string, roleSlug: string): Promise<boolean> {
  const assignments = await getRoleAssignmentsForUser(userId);
  return assignments.some((assignment) => assignment.role.slug === roleSlug);
}
