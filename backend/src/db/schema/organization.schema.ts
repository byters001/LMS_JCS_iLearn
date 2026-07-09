import { sql } from 'drizzle-orm';
import { date, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
