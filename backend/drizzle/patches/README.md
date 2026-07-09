# drizzle/patches/ — historical, deprecated

This directory was a stopgap for hand-written SQL patches, used before
`drizzle-kit` was set up (see `drizzle.config.ts` and the
`db:generate` / `db:migrate` / `db:studio` scripts in `package.json`).

**Do not add new files here.** Any new schema or permissions/seed-data
change should go through `drizzle-kit generate` (which diffs
`src/db/schema/index.ts` against `drizzle/migrations/`) instead, producing
a tracked migration under `drizzle/migrations/`.

## `2026-07-09_add-colleges-view-and-users-manage-roles-permissions.sql`

Already run against the live Supabase database and already folded into
`drizzle/reference/schema.sql`'s Section 12 seed block (see that file's
note directly under the Section 12 header). Kept here only as a historical
record of exactly what that ad hoc patch did — do not re-run it, and do
not treat it as a pending/unapplied change.
