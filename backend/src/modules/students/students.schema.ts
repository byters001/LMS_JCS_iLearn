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
    // Matches against the joined users.fullName or the student's own
    // rollNumber (see students.repository.ts's buildDirectConditions) —
    // the two fields an admin would actually type into a search box.
    search: z.string().min(1).optional(),
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

// --- Bulk student creation (Phase 3) ---
// Route is POST /batches/:id/students — :id here is a BATCH id, not a
// student_profiles id, hence a separate params schema from
// studentProfileIdParamsSchema above rather than reusing it (same name,
// different resource, would be confusing to share).
export const batchStudentsParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();

const studentRowSchema = z.object({
  fullName: z.string().min(1, 'fullName is required'),
  email: z.string().email('email must be a valid email'),
  rollNumber: z.string().min(1).optional(),
  // Falls back to the batch's training program's own departmentId when
  // omitted (see students.service.ts) — a row-level override only matters
  // when a batch's cohort spans more than one department.
  departmentId: z.string().uuid('departmentId must be a valid UUID').optional(),
});

// Single-student manual entry reuses this exact schema (and the same
// service function/route) with a one-item `students` array — per the
// brief's own "same endpoint, friendlier single-row UI" instruction, not a
// separate backend path.
export const createStudentsInBatchSchema = z
  .object({
    students: z
      .array(studentRowSchema)
      .min(1, 'At least one student is required')
      .max(500, 'Maximum 500 students per request'),
  })
  .strict();

// --- CSV export (Phase 3) ---
export const exportBatchStudentsQuerySchema = z
  .object({
    // "first N" per the brief's own spec — caps how many rows the export
    // includes, applied after the other filters below.
    limit: z.coerce.number().int().positive().max(5000).optional(),
    departmentId: z.string().uuid('departmentId must be a valid UUID').optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict();

export type ListStudentProfilesQuery = z.infer<typeof listStudentProfilesQuerySchema>;
export type CreateStudentProfileInput = z.infer<typeof createStudentProfileSchema>;
export type UpdateStudentProfileInput = z.infer<typeof updateStudentProfileSchema>;
export type StudentProfileIdParams = z.infer<typeof studentProfileIdParamsSchema>;
export type BatchStudentsParams = z.infer<typeof batchStudentsParamsSchema>;
export type CreateStudentsInBatchInput = z.infer<typeof createStudentsInBatchSchema>;
export type ExportBatchStudentsQuery = z.infer<typeof exportBatchStudentsQuerySchema>;
