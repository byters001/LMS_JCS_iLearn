import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { featureFlags, moduleToggles, systemSettings } from '../../db/schema/settings.schema';
import type { FeatureFlag, ModuleToggle, SystemSetting } from '../../db/types';

type ModuleName =
  | 'question_bank'
  | 'coding'
  | 'leaderboard'
  | 'practice_tests'
  | 'ai_assistant'
  | 'reports';
type SettingCategory = 'general' | 'security' | 'integration' | 'email' | 'ai';
type SettingValueType = 'string' | 'number' | 'boolean' | 'json';

// --- Feature flags ---

export interface ListFeatureFlagsParams {
  scope?: 'global' | 'college';
  collegeId?: string;
  key?: string;
  page: number;
  pageSize: number;
}

export interface ListFeatureFlagsResult {
  items: FeatureFlag[];
  total: number;
}

function buildFeatureFlagsWhere(params: Omit<ListFeatureFlagsParams, 'page' | 'pageSize'>) {
  const conditions = [];
  if (params.scope) conditions.push(eq(featureFlags.scope, params.scope));
  if (params.collegeId) conditions.push(eq(featureFlags.collegeId, params.collegeId));
  if (params.key) conditions.push(eq(featureFlags.key, params.key));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

async function listFeatureFlags(params: ListFeatureFlagsParams): Promise<ListFeatureFlagsResult> {
  const { page, pageSize, ...filters } = params;
  const offset = (page - 1) * pageSize;
  const where = buildFeatureFlagsWhere(filters);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(featureFlags)
      .where(where)
      .orderBy(asc(featureFlags.key))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(featureFlags).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findFeatureFlagById(id: string): Promise<FeatureFlag | undefined> {
  const [row] = await db.select().from(featureFlags).where(eq(featureFlags.id, id)).limit(1);
  return row;
}

// Pre-insert uniqueness check mirroring the two partial unique indexes
// schema.sql defines (idx_feature_flags_global_key / _college_key) — same
// "SELECT before INSERT, translate a would-be constraint violation into a
// friendly ConflictError" discipline already established elsewhere in
// this codebase (e.g. students.service.ts's user_id pre-check), so a raw
// Postgres unique-violation error never leaks to the caller (CLAUDE.md
// non-negotiable #6).
async function findFeatureFlagByKeyAndScope(
  key: string,
  scope: 'global' | 'college',
  collegeId?: string | null,
): Promise<FeatureFlag | undefined> {
  const conditions = [eq(featureFlags.key, key), eq(featureFlags.scope, scope)];
  if (scope === 'college' && collegeId) {
    conditions.push(eq(featureFlags.collegeId, collegeId));
  }
  const [row] = await db
    .select()
    .from(featureFlags)
    .where(and(...conditions))
    .limit(1);
  return row;
}

export interface CreateFeatureFlagData {
  key: string;
  label: string;
  description?: string;
  isEnabled?: boolean;
  scope: 'global' | 'college';
  collegeId?: string | null;
  updatedBy: string | null;
}

async function createFeatureFlag(data: CreateFeatureFlagData): Promise<FeatureFlag> {
  const [row] = await db
    .insert(featureFlags)
    .values({
      key: data.key,
      label: data.label,
      description: data.description,
      isEnabled: data.isEnabled,
      scope: data.scope,
      collegeId: data.collegeId,
      updatedBy: data.updatedBy,
    })
    .returning();
  return row;
}

export interface UpdateFeatureFlagData {
  label?: string;
  description?: string | null;
  isEnabled?: boolean;
  updatedBy: string | null;
}

async function updateFeatureFlag(
  id: string,
  data: UpdateFeatureFlagData,
): Promise<FeatureFlag | undefined> {
  const [row] = await db.update(featureFlags).set(data).where(eq(featureFlags.id, id)).returning();
  return row;
}

async function deleteFeatureFlag(id: string): Promise<boolean> {
  const deleted = await db
    .delete(featureFlags)
    .where(eq(featureFlags.id, id))
    .returning({ id: featureFlags.id });
  return deleted.length > 0;
}

// --- Module toggles ---

export interface ListModuleTogglesParams {
  module?: ModuleName;
  collegeId?: string;
  page: number;
  pageSize: number;
}

export interface ListModuleTogglesResult {
  items: ModuleToggle[];
  total: number;
}

function buildModuleTogglesWhere(params: Omit<ListModuleTogglesParams, 'page' | 'pageSize'>) {
  const conditions = [];
  if (params.module) conditions.push(eq(moduleToggles.module, params.module));
  if (params.collegeId) conditions.push(eq(moduleToggles.collegeId, params.collegeId));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

async function listModuleToggles(
  params: ListModuleTogglesParams,
): Promise<ListModuleTogglesResult> {
  const { page, pageSize, ...filters } = params;
  const offset = (page - 1) * pageSize;
  const where = buildModuleTogglesWhere(filters);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(moduleToggles)
      .where(where)
      .orderBy(asc(moduleToggles.module))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(moduleToggles).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findModuleToggleById(id: string): Promise<ModuleToggle | undefined> {
  const [row] = await db.select().from(moduleToggles).where(eq(moduleToggles.id, id)).limit(1);
  return row;
}

// Same pre-insert uniqueness-check discipline as findFeatureFlagByKeyAndScope
// above, mirroring idx_module_toggles_global / _college.
async function findModuleToggleByModuleAndCollege(
  moduleName: ModuleName,
  collegeId: string | null,
): Promise<ModuleToggle | undefined> {
  const conditions = [eq(moduleToggles.module, moduleName)];
  conditions.push(collegeId ? eq(moduleToggles.collegeId, collegeId) : isNull(moduleToggles.collegeId));
  const [row] = await db
    .select()
    .from(moduleToggles)
    .where(and(...conditions))
    .limit(1);
  return row;
}

export interface CreateModuleToggleData {
  module: ModuleName;
  isEnabled?: boolean;
  collegeId?: string | null;
  updatedBy: string | null;
}

async function createModuleToggle(data: CreateModuleToggleData): Promise<ModuleToggle> {
  const [row] = await db
    .insert(moduleToggles)
    .values({
      module: data.module,
      isEnabled: data.isEnabled,
      collegeId: data.collegeId,
      updatedBy: data.updatedBy,
    })
    .returning();
  return row;
}

export interface UpdateModuleToggleData {
  isEnabled: boolean;
  updatedBy: string | null;
}

async function updateModuleToggle(
  id: string,
  data: UpdateModuleToggleData,
): Promise<ModuleToggle | undefined> {
  const [row] = await db
    .update(moduleToggles)
    .set(data)
    .where(eq(moduleToggles.id, id))
    .returning();
  return row;
}

async function deleteModuleToggle(id: string): Promise<boolean> {
  const deleted = await db
    .delete(moduleToggles)
    .where(eq(moduleToggles.id, id))
    .returning({ id: moduleToggles.id });
  return deleted.length > 0;
}

// --- System settings ---

export interface ListSystemSettingsParams {
  category?: SettingCategory;
  key?: string;
  page: number;
  pageSize: number;
}

export interface ListSystemSettingsResult {
  items: SystemSetting[];
  total: number;
}

function buildSystemSettingsWhere(params: Omit<ListSystemSettingsParams, 'page' | 'pageSize'>) {
  const conditions = [];
  if (params.category) conditions.push(eq(systemSettings.category, params.category));
  if (params.key) conditions.push(eq(systemSettings.key, params.key));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

async function listSystemSettings(
  params: ListSystemSettingsParams,
): Promise<ListSystemSettingsResult> {
  const { page, pageSize, ...filters } = params;
  const offset = (page - 1) * pageSize;
  const where = buildSystemSettingsWhere(filters);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(systemSettings)
      .where(where)
      .orderBy(asc(systemSettings.key))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(systemSettings).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findSystemSettingById(id: string): Promise<SystemSetting | undefined> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.id, id)).limit(1);
  return row;
}

// Pre-insert uniqueness check mirroring system_settings' plain
// UNIQUE(key) constraint — same discipline as the two functions above.
async function findSystemSettingByKey(key: string): Promise<SystemSetting | undefined> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return row;
}

export interface CreateSystemSettingData {
  key: string;
  value: unknown;
  valueType?: SettingValueType;
  category?: SettingCategory;
  isSecret?: boolean;
  updatedBy: string | null;
}

async function createSystemSetting(data: CreateSystemSettingData): Promise<SystemSetting> {
  const [row] = await db
    .insert(systemSettings)
    .values({
      key: data.key,
      value: data.value,
      valueType: data.valueType,
      category: data.category,
      isSecret: data.isSecret,
      updatedBy: data.updatedBy,
    })
    .returning();
  return row;
}

export interface UpdateSystemSettingData {
  value?: unknown;
  valueType?: SettingValueType;
  category?: SettingCategory;
  isSecret?: boolean;
  updatedBy: string | null;
}

async function updateSystemSetting(
  id: string,
  data: UpdateSystemSettingData,
): Promise<SystemSetting | undefined> {
  const [row] = await db
    .update(systemSettings)
    .set(data)
    .where(eq(systemSettings.id, id))
    .returning();
  return row;
}

async function deleteSystemSetting(id: string): Promise<boolean> {
  const deleted = await db
    .delete(systemSettings)
    .where(eq(systemSettings.id, id))
    .returning({ id: systemSettings.id });
  return deleted.length > 0;
}

export const settingsRepository = {
  listFeatureFlags,
  findFeatureFlagById,
  findFeatureFlagByKeyAndScope,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  listModuleToggles,
  findModuleToggleById,
  findModuleToggleByModuleAndCollege,
  createModuleToggle,
  updateModuleToggle,
  deleteModuleToggle,
  listSystemSettings,
  findSystemSettingById,
  findSystemSettingByKey,
  createSystemSetting,
  updateSystemSetting,
  deleteSystemSetting,
};
