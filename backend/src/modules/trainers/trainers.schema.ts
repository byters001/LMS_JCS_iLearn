import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

export const listTrainerProfilesQuerySchema = z
  .object({
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
    departmentId: z.string().uuid('departmentId must be a valid UUID').optional(),
    ...paginationFields,
  })
  .strict();

export const listTrainingSessionsQuerySchema = z
  .object({
    trainingProgramId: z.string().uuid('trainingProgramId must be a valid UUID').optional(),
    ...paginationFields,
  })
  .strict();

export const createTrainerProfileSchema = z
  .object({
    userId: z.string().uuid('userId must be a valid UUID'),
    specialization: z.string().min(1).optional(),
    bio: z.string().min(1).optional(),
  })
  .strict();

export const updateTrainerProfileSchema = z
  .object({
    specialization: z.string().min(1).optional(),
    bio: z.string().min(1).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const trainerProfileIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();

// --- Trainers overview / performance (Phase 5) ---

export const listTrainersOverviewQuerySchema = z
  .object({
    ...paginationFields,
  })
  .strict();

export const trainerIdParamsSchema = z
  .object({
    trainerId: z.string().uuid('trainerId must be a valid UUID'),
  })
  .strict();

export type ListTrainerProfilesQuery = z.infer<typeof listTrainerProfilesQuerySchema>;
export type ListTrainingSessionsQuery = z.infer<typeof listTrainingSessionsQuerySchema>;
export type CreateTrainerProfileInput = z.infer<typeof createTrainerProfileSchema>;
export type UpdateTrainerProfileInput = z.infer<typeof updateTrainerProfileSchema>;
export type TrainerProfileIdParams = z.infer<typeof trainerProfileIdParamsSchema>;
export type ListTrainersOverviewQuery = z.infer<typeof listTrainersOverviewQuerySchema>;
export type TrainerIdParams = z.infer<typeof trainerIdParamsSchema>;
