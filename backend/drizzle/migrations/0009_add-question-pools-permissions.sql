-- Custom SQL migration file, put your code below! --

-- Adds the 'question_pools.manage' / 'question_pools.manage_global'
-- permission keys referenced by modules/question-bank/question-bank.routes.ts.
-- Confirmed via grep against schema.sql's INSERT INTO permissions block that
-- nothing named 'question_pools.*' was already seeded (unlike
-- 'questions.approve', which IS already seeded there and needed no new key).
--
-- Mirrors 'questions.manage' / 'questions.manage_global' exactly rather than
-- a single key or a view/manage split: question_pools.college_id has the
-- identical nullable "NULL = global" shape as questions.college_id (same
-- own-college-vs-global scoping concern, same module) — see
-- question-bank.routes.ts's QUESTION_POOLS_MANAGE comment.
--
-- Same mechanism as 0003_add-trainers-permissions.sql and
-- 0005_add-students-permissions.sql: a tracked drizzle-kit migration
-- (generated via `drizzle-kit generate --custom`), applied and tracked by
-- `drizzle-kit migrate` identically to a generated migration — not a
-- hand-run ad hoc script. Granted to super_admin only, matching those two
-- migrations' own precedent (and 'questions.approve' itself, which Faculty
-- also does not hold per schema.sql's seed data).
INSERT INTO permissions (key, module, description) VALUES
  ('question_pools.manage', 'question_pools', 'Manage own/college question pools'),
  ('question_pools.manage_global', 'question_pools', 'Manage global question pools');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'super_admin'
  AND p.key IN ('question_pools.manage', 'question_pools.manage_global');
