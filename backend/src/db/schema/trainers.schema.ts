import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema';
import { trainerRoleEnum, trainingPrograms } from './organization.schema';

// Separate file from organization.schema.ts (my call): trainer_profiles and
// the training-session tables below are about trainers/training delivery,
// not organizational structure (colleges/departments/academic_years/
// training_programs/batches) — a distinct domain matching CLAUDE.md's
// module list, which already has "trainers" as its own module separate
// from "organization." Mirrors the existing 1:1(ish) pattern of
// identity.schema.ts <-> auth/users and organization.schema.ts <->
// organization.

// No deleted_at column in schema.sql — see trainers.repository.ts for what
// that means for delete support (hard delete, not soft).
export const trainerProfiles = pgTable('trainer_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  specialization: text('specialization'),
  bio: text('bio'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessionTypeEnum = pgEnum('session_type_enum', [
  'aptitude',
  'reasoning',
  'coding',
  'soft_skills',
  'interview',
  'other',
]);

export const sessionStatusEnum = pgEnum('session_status_enum', [
  'scheduled',
  'completed',
  'cancelled',
]);

// Modeled here per this phase's instructions (a "trainer-specific table"
// not covered by organization.schema.ts's training_program_trainers — that
// one staffs a trainer on an entire training PROGRAM; this one schedules
// individual SESSIONS within a program). Deliberately NOT given repository/
// service/controller/route CRUD in this phase — item 2's explicit scope was
// trainer_profiles only. assessments.training_session_id also references
// this table (per schema.sql), so it's genuinely cross-cutting rather than
// a trainers-only concern — which module ends up owning its CRUD is a call
// for a future phase, not this one. No deleted_at column either.
export const trainingSessions = pgTable(
  'training_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trainingProgramId: uuid('training_program_id')
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description'),
    sessionNumber: integer('session_number').notNull(),
    sessionDate: date('session_date').notNull(),
    startTime: time('start_time'),
    endTime: time('end_time'),
    sessionType: sessionTypeEnum('session_type').notNull().default('other'),
    status: sessionStatusEnum('status').notNull().default('scheduled'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    programIdx: index('idx_training_sessions_program').on(table.trainingProgramId),
    dateIdx: index('idx_training_sessions_date').on(table.sessionDate),
  }),
);

export const trainingSessionTrainers = pgTable(
  'training_session_trainers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trainingSessionId: uuid('training_session_id')
      .notNull()
      .references(() => trainingSessions.id, { onDelete: 'cascade' }),
    trainerId: uuid('trainer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Reuses organization.schema.ts's trainerRoleEnum — schema.sql gives
    // this the exact same Postgres enum type (trainer_role_enum) as
    // training_program_trainers.role_in_program. Redefining a second
    // pgEnum under that name here would conflict with the existing type;
    // import and reuse instead.
    roleInSession: trainerRoleEnum('role_in_session').notNull().default('co_trainer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index('idx_tst_session').on(table.trainingSessionId),
    trainerIdx: index('idx_tst_trainer').on(table.trainerId),
    sessionTrainerUnique: unique().on(table.trainingSessionId, table.trainerId),
  }),
);
