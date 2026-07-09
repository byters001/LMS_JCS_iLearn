import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { usersController } from './users.controller';
import {
  assignRoleSchema,
  listUsersQuerySchema,
  revokeRoleQuerySchema,
  updateUserSchema,
  userIdParamsSchema,
  userRoleParamsSchema,
  type AssignRoleInput,
  type ListUsersQuery,
  type RevokeRoleQuery,
  type UpdateUserInput,
  type UserIdParams,
  type UserRoleParams,
} from './users.schema';

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

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: ListUsersQuery }>(
    '/users',
    {
      preHandler: [fastify.authenticate, requirePermission('users.view')],
      preValidation: validateQuery(listUsersQuerySchema),
    },
    usersController.list,
  );

  fastify.get<{ Params: UserIdParams }>(
    '/users/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('users.view')],
      preValidation: validateParams(userIdParamsSchema),
    },
    usersController.getById,
  );

  fastify.patch<{ Params: UserIdParams; Body: UpdateUserInput }>(
    '/users/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('users.update')],
      preValidation: [validateParams(userIdParamsSchema), validateBody(updateUserSchema)],
    },
    usersController.update,
  );

  // requirePermission('users.update') here is only the baseline gate (same
  // permission as PATCH /users/:id above). usersController.uploadAvatar /
  // removeAvatar additionally check, per-request, whether the target :id is
  // the caller's own (always allowed) or requires 'users.manage_roles' as
  // the elevated/admin-scope override (see assertCanManageAvatar in
  // users.controller.ts) — that finer-grained check can't be expressed by
  // requirePermission() alone, which only supports one unconditionally
  // required permission.
  fastify.post<{ Params: UserIdParams }>(
    '/users/:id/avatar',
    {
      preHandler: [fastify.authenticate, requirePermission('users.update')],
      preValidation: validateParams(userIdParamsSchema),
    },
    usersController.uploadAvatar,
  );

  fastify.delete<{ Params: UserIdParams }>(
    '/users/:id/avatar',
    {
      preHandler: [fastify.authenticate, requirePermission('users.update')],
      preValidation: validateParams(userIdParamsSchema),
    },
    usersController.removeAvatar,
  );

  fastify.post<{ Params: UserIdParams; Body: AssignRoleInput }>(
    '/users/:id/roles',
    {
      preHandler: [fastify.authenticate, requirePermission('users.manage_roles')],
      preValidation: [validateParams(userIdParamsSchema), validateBody(assignRoleSchema)],
    },
    usersController.assignRole,
  );

  fastify.delete<{ Params: UserRoleParams; Querystring: RevokeRoleQuery }>(
    '/users/:id/roles/:roleId',
    {
      preHandler: [fastify.authenticate, requirePermission('users.manage_roles')],
      preValidation: [validateParams(userRoleParamsSchema), validateQuery(revokeRoleQuerySchema)],
    },
    usersController.revokeRole,
  );
}

export default usersRoutes;
