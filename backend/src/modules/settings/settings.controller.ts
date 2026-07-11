import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { settingsService } from './settings.service';
import type {
  CreateFeatureFlagInput,
  CreateModuleToggleInput,
  CreateSystemSettingInput,
  FeatureFlagIdParams,
  ListFeatureFlagsQuery,
  ListModuleTogglesQuery,
  ListSystemSettingsQuery,
  ModuleToggleIdParams,
  SystemSettingIdParams,
  UpdateFeatureFlagInput,
  UpdateModuleToggleInput,
  UpdateSystemSettingInput,
} from './settings.schema';

function requireUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

// --- Feature flags ---

async function listFeatureFlags(
  request: FastifyRequest<{ Querystring: ListFeatureFlagsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await settingsService.listFeatureFlags(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getFeatureFlagById(
  request: FastifyRequest<{ Params: FeatureFlagIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const flag = await settingsService.findFeatureFlagById(request.params.id);
  const response: ApiSuccessResponse<typeof flag> = { success: true, data: flag };
  reply.status(200).send(response);
}

async function createFeatureFlag(
  request: FastifyRequest<{ Body: CreateFeatureFlagInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const flag = await settingsService.createFeatureFlag(request.body, updatedBy);
  const response: ApiSuccessResponse<typeof flag> = { success: true, data: flag };
  reply.status(201).send(response);
}

async function updateFeatureFlag(
  request: FastifyRequest<{ Params: FeatureFlagIdParams; Body: UpdateFeatureFlagInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const flag = await settingsService.updateFeatureFlag(request.params.id, request.body, updatedBy);
  const response: ApiSuccessResponse<typeof flag> = { success: true, data: flag };
  reply.status(200).send(response);
}

async function deleteFeatureFlag(
  request: FastifyRequest<{ Params: FeatureFlagIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await settingsService.deleteFeatureFlag(request.params.id);
  reply.status(204).send();
}

// --- Module toggles ---

async function listModuleToggles(
  request: FastifyRequest<{ Querystring: ListModuleTogglesQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await settingsService.listModuleToggles(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getModuleToggleById(
  request: FastifyRequest<{ Params: ModuleToggleIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const toggle = await settingsService.findModuleToggleById(request.params.id);
  const response: ApiSuccessResponse<typeof toggle> = { success: true, data: toggle };
  reply.status(200).send(response);
}

async function createModuleToggle(
  request: FastifyRequest<{ Body: CreateModuleToggleInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const toggle = await settingsService.createModuleToggle(request.body, updatedBy);
  const response: ApiSuccessResponse<typeof toggle> = { success: true, data: toggle };
  reply.status(201).send(response);
}

async function updateModuleToggle(
  request: FastifyRequest<{ Params: ModuleToggleIdParams; Body: UpdateModuleToggleInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const toggle = await settingsService.updateModuleToggle(
    request.params.id,
    request.body,
    updatedBy,
  );
  const response: ApiSuccessResponse<typeof toggle> = { success: true, data: toggle };
  reply.status(200).send(response);
}

async function deleteModuleToggle(
  request: FastifyRequest<{ Params: ModuleToggleIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await settingsService.deleteModuleToggle(request.params.id);
  reply.status(204).send();
}

// --- System settings ---

async function listSystemSettings(
  request: FastifyRequest<{ Querystring: ListSystemSettingsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await settingsService.listSystemSettings(request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function getSystemSettingById(
  request: FastifyRequest<{ Params: SystemSettingIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const setting = await settingsService.findSystemSettingById(request.params.id);
  const response: ApiSuccessResponse<typeof setting> = { success: true, data: setting };
  reply.status(200).send(response);
}

async function createSystemSetting(
  request: FastifyRequest<{ Body: CreateSystemSettingInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const setting = await settingsService.createSystemSetting(request.body, updatedBy);
  const response: ApiSuccessResponse<typeof setting> = { success: true, data: setting };
  reply.status(201).send(response);
}

async function updateSystemSetting(
  request: FastifyRequest<{ Params: SystemSettingIdParams; Body: UpdateSystemSettingInput }>,
  reply: FastifyReply,
): Promise<void> {
  const updatedBy = requireUserId(request);
  const setting = await settingsService.updateSystemSetting(
    request.params.id,
    request.body,
    updatedBy,
  );
  const response: ApiSuccessResponse<typeof setting> = { success: true, data: setting };
  reply.status(200).send(response);
}

async function deleteSystemSetting(
  request: FastifyRequest<{ Params: SystemSettingIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  await settingsService.deleteSystemSetting(request.params.id);
  reply.status(204).send();
}

export const settingsController = {
  listFeatureFlags,
  getFeatureFlagById,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  listModuleToggles,
  getModuleToggleById,
  createModuleToggle,
  updateModuleToggle,
  deleteModuleToggle,
  listSystemSettings,
  getSystemSettingById,
  createSystemSetting,
  updateSystemSetting,
  deleteSystemSetting,
};
