-- Custom SQL migration file, put your code below! --

-- 0003_add-trainers-permissions.sql only granted 'trainers.view'/
-- 'trainers.manage' to super_admin (confirmed directly against
-- role_permissions before writing this — faculty holds no trainers.* key
-- at all). GET /training-sessions and GET /trainer-profiles
-- (trainers.routes.ts) both gate on 'trainers.view', and Faculty callers
-- hit both routes legitimately: CreateAssessmentPage's training-session
-- picker (features/assessments/pages/CreateAssessmentPage.tsx) is used
-- from Faculty's own /trainer/assessments/new route, not just Admin's.
-- Without this grant, GET /training-sessions 403s for every Faculty
-- caller and the dropdown never loads, blocking Faculty from creating an
-- assessment at all.
--
-- 'trainers.view' only, not 'trainers.manage' — trainer_profiles
-- create/update/delete stays Super-Admin-only, no Faculty-facing UI needs
-- write access here. Also does NOT touch /trainers/overview or
-- /trainers/:trainerId/performance (trainers.routes.ts's own comment:
-- those reuse 'trainers.view' specifically FOR its super_admin-only
-- scoping, i.e. the Phase 5 dashboard is deliberately Admin-only) — this
-- grant makes Faculty pass that same check too, but no Faculty-facing
-- route currently calls those two endpoints, so there's no behavior
-- change to guard there.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'faculty'
  AND p.key = 'trainers.view'
ON CONFLICT DO NOTHING;
