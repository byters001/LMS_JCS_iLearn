import { organizationService } from '../organization/organization.service';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { settingsRepository } from './settings.repository';
import type {
  CreateFeatureFlagInput,
  CreateModuleToggleInput,
  CreateSystemSettingInput,
  ListFeatureFlagsQuery,
  ListModuleTogglesQuery,
  ListSystemSettingsQuery,
  UpdateFeatureFlagInput,
  UpdateModuleToggleInput,
  UpdateSystemSettingInput,
} from './settings.schema';
import type {
  FeatureFlag,
  ListFeatureFlagsResult,
  ListModuleTogglesResult,
  ListSystemSettingsResult,
  ModuleToggle,
  SystemSetting,
} from './settings.types';

// --- Enforcement scope (item 4) ---
//
// Nothing anywhere in this codebase currently READS feature_flags,
// module_toggles, or system_settings before allowing a route/module to
// function — confirmed by checking (no middleware, no plugin, no
// module.service.ts anywhere references these tables or this module's
// service). This phase is deliberately CRUD ONLY, no enforcement
// middleware wired: building a "block a disabled module's routes" check
// now would be speculative — there's no consumer for it yet, and
// CLAUDE.md's own build-process discipline ("Do not build ahead of the
// current phase... without asking first") argues against adding
// enforcement infrastructure nothing currently calls. When a real
// consumer needs "is module X enabled for college Y" (e.g. a future
// module-toggle-aware route guard), it should call
// settingsService.findModuleToggleByModuleAndCollege — not yet exposed
// here since nothing needs it yet, trivial to add when something does.

// --- Feature flags ---
//
// College scoping (item 1): feature_flags pairs `scope` (enum) with
// `college_id` (nullable FK) — two signals that must agree with each
// other, which nothing at the DB level enforces (no CHECK constraint).
// This is the service-layer guard for that pairing.
function assertScopeMatchesCollegeId(
  scope: 'global' | 'college',
  collegeId: string | undefined,
): void {
  if (scope === 'global' && collegeId) {
    throw new ValidationError('collegeId must not be set when scope is "global"');
  }
  if (scope === 'college' && !collegeId) {
    throw new ValidationError('collegeId is required when scope is "college"');
  }
}

async function listFeatureFlags(query: ListFeatureFlagsQuery): Promise<ListFeatureFlagsResult> {
  const { items, total } = await settingsRepository.listFeatureFlags({
    scope: query.scope,
    collegeId: query.collegeId,
    key: query.key,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findFeatureFlagById(id: string): Promise<FeatureFlag> {
  const flag = await settingsRepository.findFeatureFlagById(id);
  if (!flag) {
    throw new NotFoundError('Feature flag not found');
  }
  return flag;
}

async function createFeatureFlag(
  input: CreateFeatureFlagInput,
  updatedBy: string,
): Promise<FeatureFlag> {
  assertScopeMatchesCollegeId(input.scope, input.collegeId);

  if (input.scope === 'college' && input.collegeId) {
    // Cross-module existence check, same tier as every other
    // organizationService.findCollegeById call elsewhere in this
    // codebase (students.service.ts, assessments.service.ts's batch
    // checks, etc.).
    await organizationService.findCollegeById(input.collegeId);
  }

  const existing = await settingsRepository.findFeatureFlagByKeyAndScope(
    input.key,
    input.scope,
    input.collegeId,
  );
  if (existing) {
    throw new ConflictError(
      input.scope === 'global'
        ? `A global feature flag with key "${input.key}" already exists`
        : `A feature flag with key "${input.key}" already exists for this college`,
    );
  }

  return settingsRepository.createFeatureFlag({
    key: input.key,
    label: input.label,
    description: input.description,
    isEnabled: input.isEnabled,
    scope: input.scope,
    collegeId: input.scope === 'college' ? input.collegeId : null,
    updatedBy,
  });
}

async function updateFeatureFlag(
  id: string,
  input: UpdateFeatureFlagInput,
  updatedBy: string,
): Promise<FeatureFlag> {
  await findFeatureFlagById(id);
  const updated = await settingsRepository.updateFeatureFlag(id, { ...input, updatedBy });
  if (!updated) {
    throw new NotFoundError('Feature flag not found');
  }
  return updated;
}

async function deleteFeatureFlag(id: string): Promise<void> {
  await findFeatureFlagById(id);
  await settingsRepository.deleteFeatureFlag(id);
}

// --- Module toggles ---
//
// College scoping (item 1): unlike feature_flags, module_toggles has NO
// separate scope column — college_id's own nullability is the only
// signal (NULL = global, NOT NULL = college override), so there's no
// scope/collegeId pairing to validate here the way feature flags need.

async function listModuleToggles(
  query: ListModuleTogglesQuery,
): Promise<ListModuleTogglesResult> {
  const { items, total } = await settingsRepository.listModuleToggles({
    module: query.module,
    collegeId: query.collegeId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findModuleToggleById(id: string): Promise<ModuleToggle> {
  const toggle = await settingsRepository.findModuleToggleById(id);
  if (!toggle) {
    throw new NotFoundError('Module toggle not found');
  }
  return toggle;
}

async function createModuleToggle(
  input: CreateModuleToggleInput,
  updatedBy: string,
): Promise<ModuleToggle> {
  if (input.collegeId) {
    await organizationService.findCollegeById(input.collegeId);
  }

  const existing = await settingsRepository.findModuleToggleByModuleAndCollege(
    input.module,
    input.collegeId ?? null,
  );
  if (existing) {
    throw new ConflictError(
      input.collegeId
        ? `A module toggle for "${input.module}" already exists for this college`
        : `A global module toggle for "${input.module}" already exists`,
    );
  }

  return settingsRepository.createModuleToggle({
    module: input.module,
    isEnabled: input.isEnabled,
    collegeId: input.collegeId ?? null,
    updatedBy,
  });
}

async function updateModuleToggle(
  id: string,
  input: UpdateModuleToggleInput,
  updatedBy: string,
): Promise<ModuleToggle> {
  await findModuleToggleById(id);
  const updated = await settingsRepository.updateModuleToggle(id, {
    isEnabled: input.isEnabled,
    updatedBy,
  });
  if (!updated) {
    throw new NotFoundError('Module toggle not found');
  }
  return updated;
}

async function deleteModuleToggle(id: string): Promise<void> {
  await findModuleToggleById(id);
  await settingsRepository.deleteModuleToggle(id);
}

// --- System settings ---
//
// is_secret masking: generalizes CLAUDE.md non-negotiable #8 ("real
// values live only in the local .env, never... in error responses") from
// specific named secrets to this table's own is_secret flag — a system
// setting flagged secret never has its real value returned in ANY
// response body (list, single read, create, update), even though the
// real value is still what gets written/updated underneath. There is no
// unmask endpoint in this phase — nothing asked for one, and adding one
// speculatively would be the same "don't build ahead of the phase"
// judgment call as item 4's enforcement question.
const SECRET_MASK = '***';

function sanitizeSystemSetting(setting: SystemSetting): SystemSetting {
  if (!setting.isSecret) {
    return setting;
  }
  return { ...setting, value: SECRET_MASK };
}

async function listSystemSettings(
  query: ListSystemSettingsQuery,
): Promise<ListSystemSettingsResult> {
  const { items, total } = await settingsRepository.listSystemSettings({
    category: query.category,
    key: query.key,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items: items.map(sanitizeSystemSetting), total, page: query.page, pageSize: query.pageSize };
}

async function findSystemSettingById(id: string): Promise<SystemSetting> {
  const setting = await settingsRepository.findSystemSettingById(id);
  if (!setting) {
    throw new NotFoundError('System setting not found');
  }
  return sanitizeSystemSetting(setting);
}

async function createSystemSetting(
  input: CreateSystemSettingInput,
  updatedBy: string,
): Promise<SystemSetting> {
  const existing = await settingsRepository.findSystemSettingByKey(input.key);
  if (existing) {
    throw new ConflictError(`A system setting with key "${input.key}" already exists`);
  }

  const created = await settingsRepository.createSystemSetting({
    key: input.key,
    value: input.value,
    valueType: input.valueType,
    category: input.category,
    isSecret: input.isSecret,
    updatedBy,
  });
  return sanitizeSystemSetting(created);
}

async function updateSystemSetting(
  id: string,
  input: UpdateSystemSettingInput,
  updatedBy: string,
): Promise<SystemSetting> {
  const existing = await settingsRepository.findSystemSettingById(id);
  if (!existing) {
    throw new NotFoundError('System setting not found');
  }

  const updated = await settingsRepository.updateSystemSetting(id, { ...input, updatedBy });
  if (!updated) {
    throw new NotFoundError('System setting not found');
  }
  return sanitizeSystemSetting(updated);
}

async function deleteSystemSetting(id: string): Promise<void> {
  const existing = await settingsRepository.findSystemSettingById(id);
  if (!existing) {
    throw new NotFoundError('System setting not found');
  }
  await settingsRepository.deleteSystemSetting(id);
}

export const settingsService = {
  listFeatureFlags,
  findFeatureFlagById,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  listModuleToggles,
  findModuleToggleById,
  createModuleToggle,
  updateModuleToggle,
  deleteModuleToggle,
  listSystemSettings,
  findSystemSettingById,
  createSystemSetting,
  updateSystemSetting,
  deleteSystemSetting,
};
