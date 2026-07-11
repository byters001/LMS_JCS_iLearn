import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema';
import { colleges } from './organization.schema';

// Names match schema.sql's CREATE TYPE statements exactly — these types
// already exist in the real Postgres database.
export const featureFlagScopeEnum = pgEnum('feature_flag_scope_enum', ['global', 'college']);
export const moduleNameEnum = pgEnum('module_name_enum', [
  'question_bank',
  'coding',
  'leaderboard',
  'practice_tests',
  'ai_assistant',
  'reports',
]);
export const settingValueTypeEnum = pgEnum('setting_value_type_enum', [
  'string',
  'number',
  'boolean',
  'json',
]);
export const settingCategoryEnum = pgEnum('setting_category_enum', [
  'general',
  'security',
  'integration',
  'email',
  'ai',
]);

// College scoping (item 1) — checked directly, NOT the same simple
// "college_id nullable = global vs scoped" pattern colleges/questions/
// question_pools use. feature_flags carries a REDUNDANT second signal: a
// dedicated `scope` enum column alongside college_id's nullability, and
// schema.sql pairs the two with TWO partial unique indexes rather than
// one plain UNIQUE(key, college_id) — one guarding "at most one global
// row per key" (scope='global'), one guarding "at most one row per
// (key, college)" (scope='college'). Nothing in schema.sql (no CHECK
// constraint) enforces that scope and college_id actually agree with
// each other (e.g. scope='global' with a non-null college_id, or
// scope='college' with a null college_id, are both structurally
// insertable) — that pairing is a service-layer invariant
// (settings.service.ts's assertScopeMatchesCollegeId), the same
// DB-doesn't-enforce-it discipline as every other such invariant already
// established in this codebase.
export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    scope: featureFlagScopeEnum('scope').notNull().default('global'),
    collegeId: uuid('college_id').references(() => colleges.id, { onDelete: 'cascade' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    globalKeyIdx: uniqueIndex('idx_feature_flags_global_key')
      .on(table.key)
      .where(sql`${table.scope} = 'global'`),
    collegeKeyIdx: uniqueIndex('idx_feature_flags_college_key')
      .on(table.key, table.collegeId)
      .where(sql`${table.scope} = 'college'`),
  }),
);

// College scoping (item 1, continued) — module_toggles does NOT carry a
// separate scope column the way feature_flags does. college_id's own
// nullability is the ONLY signal here — NULL = global, NOT NULL =
// college-specific override — matching the simpler pattern
// colleges/questions/question_pools already use elsewhere. Two partial
// unique indexes enforce it: at most one global row per module
// (college_id IS NULL), at most one row per (module, college) when
// overridden.
//
// schema.sql's own seed data (SECTION 12) inserts one global row
// (college_id NULL, is_enabled true) per module_name_enum value via
// `INSERT INTO module_toggles ... SELECT m, true, NULL FROM
// unnest(enum_range(NULL::module_name_enum))` — confirmed directly, not
// assumed. feature_flags and system_settings get NO seed rows at all in
// schema.sql; both start empty and are populated entirely through this
// module's own create endpoints.
export const moduleToggles = pgTable(
  'module_toggles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    module: moduleNameEnum('module').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    collegeId: uuid('college_id').references(() => colleges.id, { onDelete: 'cascade' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    globalIdx: uniqueIndex('idx_module_toggles_global')
      .on(table.module)
      .where(sql`${table.collegeId} IS NULL`),
    collegeIdx: uniqueIndex('idx_module_toggles_college')
      .on(table.module, table.collegeId)
      .where(sql`${table.collegeId} IS NOT NULL`),
  }),
);

// system_settings' actual shape (item 3) — checked directly against
// schema.sql, not assumed: a genuine single-row-per-key store (key TEXT
// UNIQUE, value JSONB NOT NULL, value_type/category/is_secret as
// metadata about that one value), NOT a table of typed columns with one
// row total. This means the update surface is "PATCH the value (and
// maybe category/is_secret) for a given key/id," not a bulk
// multi-column PATCH — see settings.schema.ts's (Zod)
// updateSystemSettingSchema and settings.routes.ts's
// /system-settings/:id route. No college_id at all — this table is
// purely global/platform-wide, no per-college override concept exists
// for it in schema.sql.
export const systemSettings = pgTable(
  'system_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    valueType: settingValueTypeEnum('value_type').notNull().default('string'),
    category: settingCategoryEnum('category').notNull().default('general'),
    isSecret: boolean('is_secret').notNull().default(false),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyUnique: unique().on(table.key),
    categoryIdx: index('idx_system_settings_category').on(table.category),
  }),
);
