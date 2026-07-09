import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateString = (fieldName: string) =>
  z.string().regex(DATE_PATTERN, `${fieldName} must be in YYYY-MM-DD format`);

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

// --- Colleges ---

export const listCollegesQuerySchema = z.object(paginationFields);

export const createCollegeSchema = z.object({
  name: z.string().min(1, 'name is required'),
  code: z.string().min(1, 'code is required'),
  logoUrl: z.string().url('logoUrl must be a valid URL').optional(),
  address: z.string().min(1).optional(),
  contactEmail: z.string().email('contactEmail must be a valid email').optional(),
  contactPhone: z.string().min(1).optional(),
  contractStartDate: dateString('contractStartDate').optional(),
  contractEndDate: dateString('contractEndDate').optional(),
});

export const updateCollegeSchema = z
  .object({
    name: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    logoUrl: z.string().url('logoUrl must be a valid URL').optional(),
    address: z.string().min(1).optional(),
    contactEmail: z.string().email('contactEmail must be a valid email').optional(),
    contactPhone: z.string().min(1).optional(),
    contractStartDate: dateString('contractStartDate').optional(),
    contractEndDate: dateString('contractEndDate').optional(),
    status: z.enum(['active', 'expired', 'archived']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const collegeIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// --- Departments ---

export const listDepartmentsQuerySchema = z.object({
  collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  ...paginationFields,
});

export const createDepartmentSchema = z.object({
  collegeId: z.string().uuid('collegeId must be a valid UUID'),
  name: z.string().min(1, 'name is required'),
  code: z.string().min(1).optional(),
});

export const updateDepartmentSchema = z
  .object({
    name: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const departmentIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// --- Academic years ---

export const listAcademicYearsQuerySchema = z.object({
  collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  ...paginationFields,
});

export const createAcademicYearSchema = z.object({
  collegeId: z.string().uuid('collegeId must be a valid UUID'),
  yearLabel: z.string().min(1, 'yearLabel is required'),
  startDate: dateString('startDate').optional(),
  endDate: dateString('endDate').optional(),
});

export const updateAcademicYearSchema = z
  .object({
    yearLabel: z.string().min(1).optional(),
    startDate: dateString('startDate').optional(),
    endDate: dateString('endDate').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const academicYearIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export type ListCollegesQuery = z.infer<typeof listCollegesQuerySchema>;
export type CreateCollegeInput = z.infer<typeof createCollegeSchema>;
export type UpdateCollegeInput = z.infer<typeof updateCollegeSchema>;
export type CollegeIdParams = z.infer<typeof collegeIdParamsSchema>;

export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type DepartmentIdParams = z.infer<typeof departmentIdParamsSchema>;

export type ListAcademicYearsQuery = z.infer<typeof listAcademicYearsQuerySchema>;
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;
export type UpdateAcademicYearInput = z.infer<typeof updateAcademicYearSchema>;
export type AcademicYearIdParams = z.infer<typeof academicYearIdParamsSchema>;

// --- Training programs ---

export const listTrainingProgramsQuerySchema = z.object({
  collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  departmentId: z.string().uuid('departmentId must be a valid UUID').optional(),
  ...paginationFields,
});

export const createTrainingProgramSchema = z.object({
  collegeId: z.string().uuid('collegeId must be a valid UUID'),
  departmentId: z.string().uuid('departmentId must be a valid UUID'),
  academicYearId: z.string().uuid('academicYearId must be a valid UUID').optional(),
  name: z.string().min(1, 'name is required'),
  description: z.string().min(1).optional(),
  startDate: dateString('startDate').optional(),
  endDate: dateString('endDate').optional(),
});

export const updateTrainingProgramSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    startDate: dateString('startDate').optional(),
    endDate: dateString('endDate').optional(),
    status: z.enum(['planned', 'ongoing', 'completed', 'archived']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const trainingProgramIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// --- Training program trainers ---

export const listTrainingProgramTrainersQuerySchema = z.object({
  ...paginationFields,
});

export const assignTrainingProgramTrainerSchema = z.object({
  trainerId: z.string().uuid('trainerId must be a valid UUID'),
  roleInProgram: z.enum(['lead', 'co_trainer']).optional(),
});

export const trainingProgramTrainerParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  trainerId: z.string().uuid('trainerId must be a valid UUID'),
});

// --- Batches ---

export const listBatchesQuerySchema = z.object({
  trainingProgramId: z.string().uuid('trainingProgramId must be a valid UUID').optional(),
  ...paginationFields,
});

export const createBatchSchema = z.object({
  trainingProgramId: z.string().uuid('trainingProgramId must be a valid UUID'),
  name: z.string().min(1, 'name is required'),
  maxStudents: z.coerce.number().int().positive().optional(),
});

export const updateBatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    maxStudents: z.coerce.number().int().positive().optional(),
    status: z.enum(['active', 'completed', 'archived']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const batchIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export type ListTrainingProgramsQuery = z.infer<typeof listTrainingProgramsQuerySchema>;
export type CreateTrainingProgramInput = z.infer<typeof createTrainingProgramSchema>;
export type UpdateTrainingProgramInput = z.infer<typeof updateTrainingProgramSchema>;
export type TrainingProgramIdParams = z.infer<typeof trainingProgramIdParamsSchema>;

export type ListTrainingProgramTrainersQuery = z.infer<
  typeof listTrainingProgramTrainersQuerySchema
>;
export type AssignTrainingProgramTrainerInput = z.infer<
  typeof assignTrainingProgramTrainerSchema
>;
export type TrainingProgramTrainerParams = z.infer<typeof trainingProgramTrainerParamsSchema>;

export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
export type BatchIdParams = z.infer<typeof batchIdParamsSchema>;
