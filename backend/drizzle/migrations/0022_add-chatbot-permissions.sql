-- Custom SQL migration file, put your code below! --

-- Adds the 'chatbot.query' permission key referenced by
-- modules/chatbot/chatbot.routes.ts. Confirmed via grep against
-- schema.sql's INSERT INTO permissions block, plus every migration since,
-- that nothing named 'chatbot.*' was already seeded. Deliberately a single
-- key, no view/manage split: the chatbot module has no "manage" surface at
-- all (it's read-only report queries), unlike trainer_profiles/students,
-- which both got a real manage tier.
--
-- Seeded to BOTH super_admin and faculty explicitly — per the task's own
-- "super_admin/faculty only, reject others server-side" requirement.
-- super_admin's blanket "grant all permissions" INSERT in schema.sql
-- (`SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.slug =
-- 'super_admin'`) only ran once, at initial seed time — it does NOT
-- retroactively cover permission keys added by later migrations, so
-- super_admin needs this key granted explicitly here too, same as
-- 0003_add-trainers-permissions.sql already had to do for trainers.view/
-- trainers.manage.
--
-- This is a tracked drizzle-kit migration (generated via
-- `drizzle-kit generate --custom`), same mechanism as 0003/0005/0009/
-- 0016/0018 before it — not a hand-run ad hoc script.
INSERT INTO permissions (key, module, description) VALUES
  ('chatbot.query', 'chatbot', 'Ask the reporting chatbot (allowlisted report functions only)');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug IN ('super_admin', 'faculty')
  AND p.key = 'chatbot.query';
