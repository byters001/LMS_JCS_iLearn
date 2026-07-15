import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

// z.coerce.boolean() is wrong for a query-string field: it calls JS's
// Boolean(str), and Boolean('false') is true (any non-empty string is
// truthy) — so ?includeArchived=false was silently being treated as
// includeArchived=true. Preprocess the literal query-string values instead.
const includeArchivedQueryParam = z.preprocess((val) => {
  if (val === 'true') return true;
  if (val === 'false') return false;
  return val;
}, z.boolean());

export const listStudentProfilesQuerySchema = z
  .object({
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
    departmentId: z.string().uuid('departmentId must be a valid UUID').optional(),
    batchId: z.string().uuid('batchId must be a valid UUID').optional(),
    // Default false: excludes archived students, matching the deletedAt
    // IS NULL convention every other soft-delete-equivalent list endpoint
    // follows. Gated behind the same 'students.view' permission as the rest
    // of this endpoint — no separate key (see students.routes.ts).
    includeArchived: includeArchivedQueryParam.optional().default(false),
    ...paginationFields,
  })
  .strict();

export const createStudentProfileSchema = z
  .object({
    userId: z.string().uuid('userId must be a valid UUID'),
    collegeId: z.string().uuid('collegeId must be a valid UUID'),
    departmentId: z.string().uuid('departmentId must be a valid UUID').optional(),
    rollNumber: z.string().min(1).optional(),
    photoUrl: z.string().url('photoUrl must be a valid URL').optional(),
    contactEmailAlt: z.string().email('contactEmailAlt must be a valid email').optional(),
    contactPhone: z.string().min(1).optional(),
  })
  .strict();

export const updateStudentProfileSchema = z
  .object({
    rollNumber: z.string().min(1).optional(),
    photoUrl: z.string().url('photoUrl must be a valid URL').optional(),
    contactEmailAlt: z.string().email('contactEmailAlt must be a valid email').optional(),
    contactPhone: z.string().min(1).optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const studentProfileIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();

export type ListStudentProfilesQuery = z.infer<typeof listStudentProfilesQuerySchema>;
export type CreateStudentProfileInput = z.infer<typeof createStudentProfileSchema>;
export type UpdateStudentProfileInput = z.infer<typeof updateStudentProfileSchema>;
export type StudentProfileIdParams = z.infer<typeof studentProfileIdParamsSchema>;
