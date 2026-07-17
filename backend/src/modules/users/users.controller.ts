import type { FastifyReply, FastifyRequest } from 'fastify';
import { STORAGE_BUCKET, STORAGE_BUCKET_CONFIG } from '../../integrations/supabase';
import { organizationService } from '../organization/organization.service';
import { permissionCache } from '../../rbac/permission-cache';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { usersService } from './users.service';
import type {
  AssignRoleInput,
  CreateFacultyUserInput,
  ListUsersQuery,
  RevokeRoleQuery,
  UpdateUserInput,
  UserIdParams,
  UserRoleParams,
} from './users.schema';

// Self-or-admin-scope check for the avatar routes: a user may always manage
// their own avatar; managing someone else's requires the same permission
// that already gates role assignment (users.manage_roles), which is this
// codebase's existing marker for elevated/admin scope (see the role
// assignment routes in users.routes.ts).
//
// Sourced from the same data permissionCache.get() that
// rbac/require-permission.ts's requirePermission() reads — not a new lookup
// path. But the OR-with-self-ownership branching itself has no equivalent in
// requirePermission(), which only supports "this one permission is
// unconditionally required" and is wired as a route-level preHandler, not a
// reusable boolean check. So this duplicates requirePermission()'s
// permissionCache.get()-then-.includes() shape rather than calling into it.
// Worth consolidating into a shared `hasPermission(user, key)` helper in
// rbac/ if more routes end up needing self-or-permission logic like this.
async function assertCanManageAvatar(
  request: FastifyRequest<{ Params: UserIdParams }>,
): Promise<void> {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }

  if (request.user.id === request.params.id) {
    return;
  }

  const permissionKeys =
    (await permissionCache.get(request.user.id, request.user.activeCollegeId ?? null)) ?? [];

  if (!permissionKeys.includes('users.manage_roles')) {
    throw new ForbiddenError('You can only manage your own avatar');
  }
}

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

// Faculty account creation (Admin's Faculty management UI) — the real
// POST /users gap. collegeId's existence is validated HERE, not in
// usersService, specifically to avoid a circular import: organization.
// service.ts already imports usersService, so usersService importing
// organizationService back would create a cycle. A controller importing
// both services has no such problem.
async function createFacultyUser(
  request: FastifyRequest<{ Body: CreateFacultyUserInput }>,
  reply: FastifyReply,
): Promise<void> {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  // collegeId is now optional (item 1) — a faculty account can be created
  // with no college affiliation yet, assigned later via batch/training-
  // program trainer assignment. Only validate it exists when one was
  // actually provided.
  if (request.body.collegeId) {
    await organizationService.findCollegeById(request.body.collegeId);
  }
  const user = await usersService.createFacultyUser(request.body, request.user.id);
  const response: ApiSuccessResponse<typeof user> = { success: true, data: user };
  reply.status(201).send(response);
}

// multipart/form-data, not JSON — nothing here for users.schema.ts's Zod
// validators to check; contentType is validated by hand below instead.
async function uploadAvatar(
  request: FastifyRequest<{ Params: UserIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await assertCanManageAvatar(request);

  const multipartFile = await request.file();
  if (!multipartFile) {
    throw new ValidationError('No file uploaded');
  }

  const contentType = multipartFile.mimetype;
  const { allowedMimeTypes } = STORAGE_BUCKET_CONFIG[STORAGE_BUCKET.AVATARS];

  // Fail fast here rather than relying solely on storage.ts's own
  // validateUpload — that check only runs after the file has already been
  // buffered and an upload attempt made against Supabase.
  if (!allowedMimeTypes.includes(contentType)) {
    throw new ValidationError(`Content type "${contentType}" is not allowed for avatars`, {
      allowedMimeTypes,
    });
  }

  const fileBuffer = await multipartFile.toBuffer();

  const avatarUrl = await usersService.uploadAvatar(request.params.id, fileBuffer, contentType);

  const response: ApiSuccessResponse<{ avatarUrl: string }> = {
    success: true,
    data: { avatarUrl },
  };
  reply.status(200).send(response);
}

async function removeAvatar(
  request: FastifyRequest<{ Params: UserIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await assertCanManageAvatar(request);

  await usersService.removeAvatar(request.params.id);
  reply.status(204).send();
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

export const usersController = {
  list,
  getById,
  update,
  createFacultyUser,
  uploadAvatar,
  removeAvatar,
  assignRole,
  revokeRole,
};
