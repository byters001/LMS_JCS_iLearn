import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

export const listTrainerProfilesQuerySchema = z.object({
  collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  departmentId: z.string().uuid('departmentId must be a valid UUID').optional(),
  ...paginationFields,
});

export const createTrainerProfileSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  specialization: z.string().min(1).optional(),
  bio: z.string().min(1).optional(),
});

export const updateTrainerProfileSchema = z
  .object({
    specialization: z.string().min(1).optional(),
    bio: z.string().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const trainerProfileIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export type ListTrainerProfilesQuery = z.infer<typeof listTrainerProfilesQuerySchema>;
export type CreateTrainerProfileInput = z.infer<typeof createTrainerProfileSchema>;
export type UpdateTrainerProfileInput = z.infer<typeof updateTrainerProfileSchema>;
export type TrainerProfileIdParams = z.infer<typeof trainerProfileIdParamsSchema>;
