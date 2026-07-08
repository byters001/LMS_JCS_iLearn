import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { permissions, rolePermissions, roles, userRoles, users } from './schema/identity.schema';

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Role = InferSelectModel<typeof roles>;
export type NewRole = InferInsertModel<typeof roles>;

export type Permission = InferSelectModel<typeof permissions>;
export type NewPermission = InferInsertModel<typeof permissions>;

export type RolePermission = InferSelectModel<typeof rolePermissions>;
export type NewRolePermission = InferInsertModel<typeof rolePermissions>;

export type UserRole = InferSelectModel<typeof userRoles>;
export type NewUserRole = InferInsertModel<typeof userRoles>;
