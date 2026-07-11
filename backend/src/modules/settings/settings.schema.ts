import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

const moduleNameValues = [
  'question_bank',
  'coding',
  'leaderboard',
  'practice_tests',
  'ai_assistant',
  'reports',
] as const;

const settingCategoryValues = ['general', 'security', 'integration', 'email', 'ai'] as const;
const settingValueTypeValues = ['string', 'number', 'boolean', 'json'] as const;

// --- Feature flags ---

export const listFeatureFlagsQuerySchema = z
  .object({
    scope: z.enum(['global', 'college']).optional(),
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
    key: z.string().min(1).optional(),
    ...paginationFields,
  })
  .strict();

// scope/collegeId pairing (global => no collegeId, college => collegeId
// required) is validated in settings.service.ts
// (assertScopeMatchesCollegeId), not here — same "cross-field validation
// belongs in the service layer" convention this codebase already uses
// (e.g. assessments.service.ts's assertValidDateRange), not a Zod
// .refine() mid-parse check.
export const createFeatureFlagSchema = z
  .object({
    key: z.string().min(1, 'key is required'),
    label: z.string().min(1, 'label is required'),
    description: z.string().min(1).optional(),
    isEnabled: z.boolean().optional().default(true),
    scope: z.enum(['global', 'college']).optional().default('global'),
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  })
  .strict();

// key/scope/collegeId excluded — structural identity fields (which flag
// this is), same treatment createAssessmentSchema's trainingSessionId/
// testCategory already get on updateAssessmentSchema.
export const updateFeatureFlagSchema = z
  .object({
    label: z.string().min(1).optional(),
    description: z.string().min(1).nullable().optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const featureFlagIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();

// --- Module toggles ---

export const listModuleTogglesQuerySchema = z
  .object({
    module: z.enum(moduleNameValues).optional(),
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
    ...paginationFields,
  })
  .strict();

export const createModuleToggleSchema = z
  .object({
    module: z.enum(moduleNameValues),
    isEnabled: z.boolean().optional().default(true),
    collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
  })
  .strict();

// module/collegeId excluded — structural identity (which toggle this
// is). isEnabled is the ONLY thing update ever changes, so it's required
// here rather than optional-with-a-refine — an empty PATCH body would be
// meaningless when there's exactly one updatable field.
export const updateModuleToggleSchema = z
  .object({
    isEnabled: z.boolean(),
  })
  .strict();

export const moduleToggleIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();

// --- System settings ---

export const listSystemSettingsQuerySchema = z
  .object({
    category: z.enum(settingCategoryValues).optional(),
    key: z.string().min(1).optional(),
    ...paginationFields,
  })
  .strict();

// value is genuinely untyped JSONB in schema.sql (no CHECK constraint
// backing valueType's meaning — value_type is metadata describing the
// value, not something the DB enforces against it), so z.unknown() here
// is the honest shape, not a shortcut. The .refine() below only guards
// against the key being omitted entirely — value is NOT NULL at the DB
// layer, but z.unknown() alone would silently accept a missing key as
// `undefined`.
export const createSystemSettingSchema = z
  .object({
    key: z.string().min(1, 'key is required'),
    value: z.unknown(),
    valueType: z.enum(settingValueTypeValues).optional().default('string'),
    category: z.enum(settingCategoryValues).optional().default('general'),
    isSecret: z.boolean().optional().default(false),
  })
  .strict()
  .refine((data) => data.value !== undefined, {
    message: 'value is required',
  });

// key excluded — structural identity (which setting this is).
export const updateSystemSettingSchema = z
  .object({
    value: z.unknown().optional(),
    valueType: z.enum(settingValueTypeValues).optional(),
    category: z.enum(settingCategoryValues).optional(),
    isSecret: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const systemSettingIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();

export type ListFeatureFlagsQuery = z.infer<typeof listFeatureFlagsQuerySchema>;
export type CreateFeatureFlagInput = z.infer<typeof createFeatureFlagSchema>;
export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagSchema>;
export type FeatureFlagIdParams = z.infer<typeof featureFlagIdParamsSchema>;

export type ListModuleTogglesQuery = z.infer<typeof listModuleTogglesQuerySchema>;
export type CreateModuleToggleInput = z.infer<typeof createModuleToggleSchema>;
export type UpdateModuleToggleInput = z.infer<typeof updateModuleToggleSchema>;
export type ModuleToggleIdParams = z.infer<typeof moduleToggleIdParamsSchema>;

export type ListSystemSettingsQuery = z.infer<typeof listSystemSettingsQuerySchema>;
export type CreateSystemSettingInput = z.infer<typeof createSystemSettingSchema>;
export type UpdateSystemSettingInput = z.infer<typeof updateSystemSettingSchema>;
export type SystemSettingIdParams = z.infer<typeof systemSettingIdParamsSchema>;
