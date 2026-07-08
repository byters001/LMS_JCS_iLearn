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
