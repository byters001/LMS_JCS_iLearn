import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { trainersController } from './trainers.controller';
import {
  createTrainerProfileSchema,
  listTrainerProfilesQuerySchema,
  listTrainingSessionsQuerySchema,
  trainerProfileIdParamsSchema,
  updateTrainerProfileSchema,
  type CreateTrainerProfileInput,
  type ListTrainerProfilesQuery,
  type ListTrainingSessionsQuery,
  type TrainerProfileIdParams,
  type UpdateTrainerProfileInput,
} from './trainers.schema';

function validateQuery(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query parameters', parsed.error.flatten());
    }
    request.query = parsed.data;
  };
}

function validateParams(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid route parameters', parsed.error.flatten());
    }
    request.params = parsed.data;
  };
}

function validateBody(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    request.body = parsed.data;
  };
}

// 'trainers.view' / 'trainers.manage' — NEW keys, not in schema.sql's seed
// data (confirmed by grep, not assumed). No existing key fits: closest
// candidates are 'training_sessions.manage' (about session scheduling, not
// trainer profiles) and 'users.edit' (about the underlying account, not the
// trainer-specific profile fields). This follows the view/manage split
// precedent from users.view/users.edit and colleges.view/colleges.manage —
// trainer_profiles is a substantive profile entity, same shape as those,
// not a thin join table like training_program_trainers (which reuses
// training_programs.manage with no split — see organization.routes.ts).
// Routed under /trainer-profiles, not /trainers: schema.sql already
// overloads "trainer" across several distinct concepts (trainer_profiles,
// training_program_trainers, training_session_trainers) — the precise
// entity name avoids colliding with those other trainer-assignment routes
// (e.g. organization.routes.ts's /training-programs/:id/trainers).
export async function trainersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: ListTrainerProfilesQuery }>(
    '/trainer-profiles',
    {
      preHandler: [fastify.authenticate, requirePermission('trainers.view')],
      preValidation: validateQuery(listTrainerProfilesQuerySchema),
    },
    trainersController.listTrainerProfiles,
  );

  fastify.get<{ Params: TrainerProfileIdParams }>(
    '/trainer-profiles/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('trainers.view')],
      preValidation: validateParams(trainerProfileIdParamsSchema),
    },
    trainersController.getTrainerProfileById,
  );

  fastify.post<{ Body: CreateTrainerProfileInput }>(
    '/trainer-profiles',
    {
      preHandler: [fastify.authenticate, requirePermission('trainers.manage')],
      preValidation: validateBody(createTrainerProfileSchema),
    },
    trainersController.createTrainerProfile,
  );

  fastify.patch<{ Params: TrainerProfileIdParams; Body: UpdateTrainerProfileInput }>(
    '/trainer-profiles/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('trainers.manage')],
      preValidation: [
        validateParams(trainerProfileIdParamsSchema),
        validateBody(updateTrainerProfileSchema),
      ],
    },
    trainersController.updateTrainerProfile,
  );

  fastify.delete<{ Params: TrainerProfileIdParams }>(
    '/trainer-profiles/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('trainers.manage')],
      preValidation: validateParams(trainerProfileIdParamsSchema),
    },
    trainersController.deleteTrainerProfile,
  );

  // List-only, read path — 'trainers.view' matches the read-route precedent
  // above (GET /trainer-profiles). No create/update/delete route here:
  // training_session content ownership is unsettled (see db/schema/
  // trainers.schema.ts and this module's repository/service comments) —
  // full CRUD is a later, larger scope decision, not this phase's.
  fastify.get<{ Querystring: ListTrainingSessionsQuery }>(
    '/training-sessions',
    {
      preHandler: [fastify.authenticate, requirePermission('trainers.view')],
      preValidation: validateQuery(listTrainingSessionsQuerySchema),
    },
    trainersController.listTrainingSessions,
  );
}

export default trainersRoutes;
