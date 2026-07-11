import type { FeatureFlag, ModuleToggle, SystemSetting } from '../../db/types';

export type { FeatureFlag, ModuleToggle, SystemSetting };

export interface ListFeatureFlagsResult {
  items: FeatureFlag[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListModuleTogglesResult {
  items: ModuleToggle[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListSystemSettingsResult {
  items: SystemSetting[];
  total: number;
  page: number;
  pageSize: number;
}
