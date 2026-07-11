import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { settingsController } from './settings.controller';
import {
  createFeatureFlagSchema,
  createModuleToggleSchema,
  createSystemSettingSchema,
  featureFlagIdParamsSchema,
  listFeatureFlagsQuerySchema,
  listModuleTogglesQuerySchema,
  listSystemSettingsQuerySchema,
  moduleToggleIdParamsSchema,
  systemSettingIdParamsSchema,
  updateFeatureFlagSchema,
  updateModuleToggleSchema,
  updateSystemSettingSchema,
  type CreateFeatureFlagInput,
  type CreateModuleToggleInput,
  type CreateSystemSettingInput,
  type FeatureFlagIdParams,
  type ListFeatureFlagsQuery,
  type ListModuleTogglesQuery,
  type ListSystemSettingsQuery,
  type ModuleToggleIdParams,
  type SystemSettingIdParams,
  type UpdateFeatureFlagInput,
  type UpdateModuleToggleInput,
  type UpdateSystemSettingInput,
} from './settings.schema';

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

// --- Permissions (item 2) ---
// schema.sql seeds exactly two keys for this module — confirmed directly,
// not assumed:
//   ('ui_control.manage', 'settings', 'Manage feature flags and module toggles')
//   ('settings.manage', 'settings', 'Manage system settings')
// This is NOT one key covering all three tables — it's already split by
// schema.sql's own authors along exactly the feature_flags/module_toggles
// vs system_settings boundary, so UI_CONTROL_MANAGE gates the first two
// tables and SETTINGS_MANAGE gates the third. Neither key is granted to
// Faculty in the seed data (its INSERT INTO role_permissions grant list
// doesn't include either) — only Super Admin has both, via the blanket
// CROSS JOIN grant. No dedicated "view" key exists for either group, so
// (same precedent as every other staff-facing module in this codebase,
// e.g. assessments.create reused for reads) the manage-tier key gates
// BOTH reads and writes here — there's no student/self-service angle to
// this module at all, unlike attempts.
const UI_CONTROL_MANAGE = requirePermission('ui_control.manage');
const SETTINGS_MANAGE = requirePermission('settings.manage');

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  // --- Feature flags ---

  fastify.get<{ Querystring: ListFeatureFlagsQuery }>(
    '/feature-flags',
    {
      preHandler: [fastify.authenticate, UI_CONTROL_MANAGE],
      preValidation: validateQuery(listFeatureFlagsQuerySchema),
    },
    settingsController.listFeatureFlags,
  );

  fastify.get<{ Params: FeatureFlagIdParams }>(
    '/feature-flags/:id',
    {
      preHandler: [fastify.authenticate, UI_CONTROL_MANAGE],
      preValidation: validateParams(featureFlagIdParamsSchema),
    },
    settingsController.getFeatureFlagById,
  );

  fastify.post<{ Body: CreateFeatureFlagInput }>(
    '/feature-flags',
    {
      preHandler: [fastify.authenticate, UI_CONTROL_MANAGE],
      preValidation: validateBody(createFeatureFlagSchema),
    },
    settingsController.createFeatureFlag,
  );

  fastify.patch<{ Params: FeatureFlagIdParams; Body: UpdateFeatureFlagInput }>(
    '/feature-flags/:id',
    {
      preHandler: [fastify.authenticate, UI_CONTROL_MANAGE],
      preValidation: [
        validateParams(featureFlagIdParamsSchema),
        validateBody(updateFeatureFlagSchema),
      ],
    },
    settingsController.updateFeatureFlag,
  );

  fastify.delete<{ Params: FeatureFlagIdParams }>(
    '/feature-flags/:id',
    {
      preHandler: [fastify.authenticate, UI_CONTROL_MANAGE],
      preValidation: validateParams(featureFlagIdParamsSchema),
    },
    settingsController.deleteFeatureFlag,
  );

  // --- Module toggles ---

  fastify.get<{ Querystring: ListModuleTogglesQuery }>(
    '/module-toggles',
    {
      preHandler: [fastify.authenticate, UI_CONTROL_MANAGE],
      preValidation: validateQuery(listModuleTogglesQuerySchema),
    },
    settingsController.listModuleToggles,
  );

  fastify.get<{ Params: ModuleToggleIdParams }>(
    '/module-toggles/:id',
    {
      preHandler: [fastify.authenticate, UI_CONTROL_MANAGE],
      preValidation: validateParams(moduleToggleIdParamsSchema),
    },
    settingsController.getModuleToggleById,
  );

  fastify.post<{ Body: CreateModuleToggleInput }>(
    '/module-toggles',
    {
      preHandler: [fastify.authenticate, UI_CONTROL_MANAGE],
      preValidation: validateBody(createModuleToggleSchema),
    },
    settingsController.createModuleToggle,
  );

  fastify.patch<{ Params: ModuleToggleIdParams; Body: UpdateModuleToggleInput }>(
    '/module-toggles/:id',
    {
      preHandler: [fastify.authenticate, UI_CONTROL_MANAGE],
      preValidation: [
        validateParams(moduleToggleIdParamsSchema),
        validateBody(updateModuleToggleSchema),
      ],
    },
    settingsController.updateModuleToggle,
  );

  fastify.delete<{ Params: ModuleToggleIdParams }>(
    '/module-toggles/:id',
    {
      preHandler: [fastify.authenticate, UI_CONTROL_MANAGE],
      preValidation: validateParams(moduleToggleIdParamsSchema),
    },
    settingsController.deleteModuleToggle,
  );

  // --- System settings ---

  fastify.get<{ Querystring: ListSystemSettingsQuery }>(
    '/system-settings',
    {
      preHandler: [fastify.authenticate, SETTINGS_MANAGE],
      preValidation: validateQuery(listSystemSettingsQuerySchema),
    },
    settingsController.listSystemSettings,
  );

  fastify.get<{ Params: SystemSettingIdParams }>(
    '/system-settings/:id',
    {
      preHandler: [fastify.authenticate, SETTINGS_MANAGE],
      preValidation: validateParams(systemSettingIdParamsSchema),
    },
    settingsController.getSystemSettingById,
  );

  fastify.post<{ Body: CreateSystemSettingInput }>(
    '/system-settings',
    {
      preHandler: [fastify.authenticate, SETTINGS_MANAGE],
      preValidation: validateBody(createSystemSettingSchema),
    },
    settingsController.createSystemSetting,
  );

  fastify.patch<{ Params: SystemSettingIdParams; Body: UpdateSystemSettingInput }>(
    '/system-settings/:id',
    {
      preHandler: [fastify.authenticate, SETTINGS_MANAGE],
      preValidation: [
        validateParams(systemSettingIdParamsSchema),
        validateBody(updateSystemSettingSchema),
      ],
    },
    settingsController.updateSystemSetting,
  );

  fastify.delete<{ Params: SystemSettingIdParams }>(
    '/system-settings/:id',
    {
      preHandler: [fastify.authenticate, SETTINGS_MANAGE],
      preValidation: validateParams(systemSettingIdParamsSchema),
    },
    settingsController.deleteSystemSetting,
  );
}

export default settingsRoutes;
