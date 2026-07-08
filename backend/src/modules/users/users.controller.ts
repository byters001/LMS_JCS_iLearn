import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { usersService } from './users.service';
import type {
  AssignRoleInput,
  ListUsersQuery,
  RevokeRoleQuery,
  UpdateUserInput,
  UserIdParams,
  UserRoleParams,
} from './users.schema';

async function list(
  request: FastifyRequest<{ Querystring: ListUsersQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await usersService.list(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getById(
  request: FastifyRequest<{ Params: UserIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const user = await usersService.findById(request.params.id);
  const response: ApiSuccessResponse<typeof user> = { success: true, data: user };
  reply.status(200).send(response);
}

async function update(
  request: FastifyRequest<{ Params: UserIdParams; Body: UpdateUserInput }>,
  reply: FastifyReply,
): Promise<void> {
  const user = await usersService.update(request.params.id, request.body);
  const response: ApiSuccessResponse<typeof user> = { success: true, data: user };
  reply.status(200).send(response);
}

async function assignRole(
  request: FastifyRequest<{ Params: UserIdParams; Body: AssignRoleInput }>,
  reply: FastifyReply,
): Promise<void> {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }

  const assignment = await usersService.assignRole(
    request.params.id,
    request.body,
    request.user.id,
  );
  const response: ApiSuccessResponse<typeof assignment> = { success: true, data: assignment };
  reply.status(201).send(response);
}

async function revokeRole(
  request: FastifyRequest<{ Params: UserRoleParams; Querystring: RevokeRoleQuery }>,
  reply: FastifyReply,
): Promise<void> {
  await usersService.revokeRole(
    request.params.id,
    request.params.roleId,
    request.query.collegeId ?? null,
  );
  reply.status(204).send();
}

export const usersController = { list, getById, update, assignRole, revokeRole };
