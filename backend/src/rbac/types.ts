import type { Permission, Role, RolePermission } from '../db/types';

export type { Permission, Role, RolePermission };

export type PermissionKey = Permission['key'];

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}
