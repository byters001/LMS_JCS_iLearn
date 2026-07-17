import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    roleSlug: z.string().min(1).optional(),
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
    // Optional — omitted keeps the existing "everyone regardless of status"
    // default (FacultyListPage's Deactivate/Reactivate table needs both).
    // Callers that only want live candidates (AssignTrainerDialog's search)
    // pass isActive=true explicitly.
    isActive: z.coerce.boolean().optional(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    fullName: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field (fullName, isActive) must be provided',
  });

export const assignRoleSchema = z
  .object({
    roleId: z.string().uuid('roleId must be a valid UUID'),
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  })
  .strict();

// Deliberately narrow: this creates a Faculty account specifically (role is
// fixed server-side in users.service.ts's createFacultyUser, not a
// roleSlug field here) — not a generic "create any user with any role"
// endpoint. A generic creator would need considerably more validation
// (can't self-assign super_admin, students already have their own
// specialized creation flow via createStudentsInBatch with batch/common-
// password logic that doesn't apply here) that this Faculty-management UI
// doesn't need. collegeId is required, not derived from the caller's own
// activeCollegeId — the caller here is always Super Admin (activeCollegeId
// null, global), so there's nothing to derive from; the admin explicitly
// picks which college this faculty member belongs to.
export const createFacultyUserSchema = z
  .object({
    email: z.string().email('email must be a valid email address'),
    fullName: z.string().min(1, 'fullName is required'),
    // Same min-length convention as organization.schema.ts's
    // createBatchSchema commonPassword field.
    password: z.string().min(8, 'password must be at least 8 characters'),
    // Optional: a faculty account's college affiliation is assigned later,
    // via batch/training-program trainer assignment (organization module),
    // not required up front at account creation. user_roles.college_id
    // itself is nullable in schema.sql (NULL = global grant, same
    // convention Super Admin's own role assignment uses) — this was an
    // application-level constraint tightening that beyond what the data
    // model actually requires, not a DB-enforced one.
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  })
  .strict();

export const revokeRoleQuerySchema = z
  .object({
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  })
  .strict();

export const userIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();

export const userRoleParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
    roleId: z.string().uuid('roleId must be a valid UUID'),
  })
  .strict();

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type RevokeRoleQuery = z.infer<typeof revokeRoleQuerySchema>;
export type UserIdParams = z.infer<typeof userIdParamsSchema>;
export type UserRoleParams = z.infer<typeof userRoleParamsSchema>;
export type CreateFacultyUserInput = z.infer<typeof createFacultyUserSchema>;
