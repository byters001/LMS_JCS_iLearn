import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { users } from '../../db/schema/identity.schema';
import type { User } from '../../db/types';
import { getRoleAssignmentsForUser } from '../../rbac/role-assignments';

async function findUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user;
}

async function findUserById(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

export const authRepository = { findUserByEmail, findUserById, getRoleAssignmentsForUser };
