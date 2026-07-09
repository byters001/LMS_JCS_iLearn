import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    roleSlug: z.string().min(1).optional(),
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
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
