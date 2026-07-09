import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.schema';
import { batches, colleges, departments, trainingPrograms } from './organization.schema';

// Separate file from organization.schema.ts and trainers.schema.ts (same
// call as trainers.schema.ts): student_profiles/training_program_students
// are about students and enrollment, a distinct domain matching
// CLAUDE.md's module list, which has "students" as its own module.

export const studentStatusEnum = pgEnum('student_status_enum', ['active', 'archived']);

// No deleted_at column in schema.sql — but unlike trainer_profiles (which
// has NO lifecycle columns at all), student_profiles has an explicit
// status enum (active/archived) plus archived_at and access_revoked_at
// timestamps. See students.repository.ts for what that means for delete
// support: archiving (status + archived_at), not a generic soft-delete
// flag and not a physical DELETE.
export const studentProfiles = pgTable(
  'student_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    collegeId: uuid('college_id')
      .notNull()
      .references(() => colleges.id, { onDelete: 'restrict' }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    rollNumber: text('roll_number'),
    photoUrl: text('photo_url'),
    contactEmailAlt: text('contact_email_alt'),
    contactPhone: text('contact_phone'),
    status: studentStatusEnum('status').notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    accessRevokedAt: timestamp('access_revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    // Not partial (no WHERE clause) — schema.sql's own index on this table
    // isn't partial either, unlike colleges/departments' deleted_at-scoped
    // indexes. There's no deleted_at column here to scope by.
    collegeStatusIdx: index('idx_student_profiles_college_status').on(
      table.collegeId,
      table.status,
    ),
    departmentIdx: index('idx_student_profiles_department').on(table.departmentId),
  }),
);

export const tpsStatusEnum = pgEnum('tps_status_enum', [
  'active',
  'transferred',
  'repeated',
  'completed',
  'dropped',
]);

// Modeled here (needed anyway for students.repository.ts's batchId list
// filter — batch_id lives on this table, not on student_profiles), but
// deliberately NOT given repository/service/controller/route CRUD in this
// phase, mirroring training_sessions' treatment in the trainers phase.
// Enrollment management (assign a student to a program/batch, transfer,
// mark dropped, etc.) is a distinct, action-shaped concern from student
// *profile* CRUD — a call for a future phase, not this one. No
// deleted_at column here either.
export const trainingProgramStudents = pgTable(
  'training_program_students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trainingProgramId: uuid('training_program_id')
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'restrict' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'restrict' }),
    status: tpsStatusEnum('status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    programIdx: index('idx_tps_program').on(table.trainingProgramId),
    studentIdx: index('idx_tps_student').on(table.studentId),
    batchIdx: index('idx_tps_batch').on(table.batchId),
    programStatusIdx: index('idx_tps_program_status').on(table.trainingProgramId, table.status),
  }),
);
