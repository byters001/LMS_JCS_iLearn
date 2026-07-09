-- Custom SQL migration file, put your code below! --

-- Adds the 'trainers.view' / 'trainers.manage' permission keys referenced
-- by modules/trainers/trainers.routes.ts. Confirmed via grep against
-- schema.sql's INSERT INTO permissions block that nothing named 'trainers.*'
-- was already seeded — no existing key fits (training_sessions.manage is
-- about session scheduling, not trainer profiles; users.edit is about the
-- underlying account, not the trainer-specific profile fields).
--
-- This is a tracked drizzle-kit migration (generated via
-- `drizzle-kit generate --custom`), not a hand-run ad hoc script — see the
-- trainers module task response for why this is the resolved, permanent
-- answer to "how do new permission rows get into the DB" from here on:
-- drizzle-kit generate is schema-diff-only and will never produce INSERT
-- statements on its own, but --custom produces an empty, journal-tracked
-- migration file for exactly this case (DML/seed data), applied and
-- tracked by `drizzle-kit migrate` identically to a generated migration.
INSERT INTO permissions (key, module, description) VALUES
  ('trainers.view', 'trainers', 'View trainer profiles'),
  ('trainers.manage', 'trainers', 'Manage trainer profiles');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'super_admin'
  AND p.key IN ('trainers.view', 'trainers.manage');
