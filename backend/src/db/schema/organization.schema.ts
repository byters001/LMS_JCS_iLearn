import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema';

// Name matches schema.sql's `CREATE TYPE college_status_enum` exactly — this
// type already exists in the real Postgres database; Drizzle just needs to
// reference it under the same name, not redefine it.
export const collegeStatusEnum = pgEnum('college_status_enum', ['active', 'expired', 'archived']);

export const colleges = pgTable(
  'colleges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    code: text('code').notNull().unique(),
    logoUrl: text('logo_url'),
    address: text('address'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    contractStartDate: date('contract_start_date'),
    contractEndDate: date('contract_end_date'),
    status: collegeStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    statusIdx: index('idx_colleges_status')
      .on(table.status)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    collegeId: uuid('college_id')
      .notNull()
      .references(() => colleges.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    code: text('code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    collegeIdx: index('idx_departments_college')
      .on(table.collegeId)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

// No deleted_at column here — unlike colleges/departments, schema.sql does
// NOT give academic_years a soft-delete column. Do not add one; see
// organization.repository.ts for what that means for delete support.
export const academicYears = pgTable(
  'academic_years',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    collegeId: uuid('college_id')
      .notNull()
      .references(() => colleges.id, { onDelete: 'restrict' }),
    yearLabel: text('year_label').notNull(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    collegeIdx: index('idx_academic_years_college').on(table.collegeId),
  }),
);

// --- Part 2: training_programs, training_program_trainers, batches ---

export const trainingProgramStatusEnum = pgEnum('training_program_status_enum', [
  'planned',
  'ongoing',
  'completed',
  'archived',
]);

export const trainerRoleEnum = pgEnum('trainer_role_enum', ['lead', 'co_trainer']);

export const batchStatusEnum = pgEnum('batch_status_enum', ['active', 'completed', 'archived']);

export const trainingPrograms = pgTable(
  'training_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    collegeId: uuid('college_id')
      .notNull()
      .references(() => colleges.id, { onDelete: 'restrict' }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: trainingProgramStatusEnum('status').notNull().default('planned'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    collegeStatusIdx: index('idx_training_programs_college_status')
      .on(table.collegeId, table.status)
      .where(sql`${table.deletedAt} IS NULL`),
    departmentIdx: index('idx_training_programs_department').on(table.departmentId),
  }),
);

// No deleted_at column — like academic_years, schema.sql doesn't give this
// join table a soft-delete column. trainer_id references users(id) directly
// (there is no separate `trainers` table in schema.sql at all — "trainer" is
// just a role concept realized via user_roles/users, same as everywhere else
// in this schema).
export const trainingProgramTrainers = pgTable(
  'training_program_trainers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trainingProgramId: uuid('training_program_id')
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: 'cascade' }),
    trainerId: uuid('trainer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleInProgram: trainerRoleEnum('role_in_program').notNull().default('co_trainer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    programIdx: index('idx_tpt_program').on(table.trainingProgramId),
    trainerIdx: index('idx_tpt_trainer').on(table.trainerId),
    programTrainerUnique: unique().on(table.trainingProgramId, table.trainerId),
  }),
);

export const batches = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trainingProgramId: uuid('training_program_id')
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    maxStudents: integer('max_students'),
    status: batchStatusEnum('status').notNull().default('active'),
    // Nullable: existing batches have none until set. Hashed with argon2
    // (matching the exact call pattern used everywhere else in this
    // codebase — see organization.service.ts's createBatch) — never the
    // plaintext. Consumed starting Phase 3 (bulk student creation against a
    // batch); not read or written by anything in this phase beyond create.
    commonPasswordHash: text('common_password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    programStatusIdx: index('idx_batches_program_status')
      .on(table.trainingProgramId, table.status)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);
