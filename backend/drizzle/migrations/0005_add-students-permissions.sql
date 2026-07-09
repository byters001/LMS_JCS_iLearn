-- Custom SQL migration file, put your code below! --

-- Adds the 'students.view' / 'students.manage' permission keys referenced
-- by modules/students/students.routes.ts. Confirmed via grep against
-- schema.sql's INSERT INTO permissions block that nothing named
-- 'students.*' was already seeded.
--
-- Same mechanism as 0003_add-trainers-permissions.sql: a tracked
-- drizzle-kit migration (generated via `drizzle-kit generate --custom`),
-- applied and tracked by `drizzle-kit migrate` identically to a generated
-- migration — not a hand-run ad hoc script.
INSERT INTO permissions (key, module, description) VALUES
  ('students.view', 'students', 'View student profiles'),
  ('students.manage', 'students', 'Manage student profiles');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'super_admin'
  AND p.key IN ('students.view', 'students.manage');
