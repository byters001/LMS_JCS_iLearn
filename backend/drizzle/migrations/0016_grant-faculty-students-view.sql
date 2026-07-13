-- Custom SQL migration file, put your code below! --

-- 0005_add-students-permissions.sql only granted 'students.view'/
-- 'students.manage' to super_admin. The frontend's students list phase
-- (features/students/) is faculty-facing ("faculty manages students" —
-- CLAUDE1.md's students module framing), so faculty needs read access.
-- Granting view only, not manage — this phase is read-only (no
-- create/edit/archive UI yet), so there's no reason for faculty to hold
-- the write-tier permission until that UI actually exists.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'faculty'
  AND p.key = 'students.view'
ON CONFLICT DO NOTHING;
