-- Custom SQL migration file, put your code below! --

-- 0009_add-question-pools-permissions.sql only granted
-- 'question_pools.manage'/'question_pools.manage_global' to super_admin
-- (confirmed directly against role_permissions before writing this — faculty
-- holds no question_pools.* key at all, even though faculty already holds
-- 'questions.manage' per schema.sql's seed data). Every route in
-- question-bank.routes.ts under '--- Question pools ---',
-- '--- Question pool criteria ---', and '--- Pool resolution ---' is gated
-- by the single QUESTION_POOLS_MANAGE constant (requireAnyPermission([
-- 'question_pools.manage', 'question_pools.manage_global'])) — GET/POST/
-- PATCH/DELETE /question-pools, /question-pools/:id, /question-pools/:id/
-- criteria, /question-pools/:id/criteria/:criteriaId, and GET
-- /question-pools/:id/resolve all use that same guard, so this one grant
-- closes every one of those routes for Faculty at once; there is no
-- separate criteria-specific or resolve-specific key to grant.
--
-- Faculty-facing impact without this: GET /question-pools 403s, so
-- PoolListPage (frontend/src/features/question-bank/pages/PoolListPage.tsx)
-- never loads for Faculty, and AttachPoolForm's pool combobox
-- (frontend/src/features/assessments/components/AttachPoolForm.tsx), which
-- calls the same endpoint, is empty for every Faculty caller building a
-- 'pool'-mode assessment section.
--
-- 'question_pools.manage' only, not 'question_pools.manage_global' — global
-- (cross-college) pool management stays Super-Admin-only, mirroring
-- 'questions.manage_global' which Faculty also does not hold. Faculty
-- holding only 'question_pools.manage' naturally scopes to their own
-- college via the existing activeCollegeId resolution in
-- rbac/permission-cache.ts, same mechanism as 'questions.manage'.
--
-- Same mechanism as 0003/0009/0023: a tracked drizzle-kit migration
-- (generated via `drizzle-kit generate --custom`), applied and tracked by
-- `drizzle-kit migrate` identically to a generated migration.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'faculty'
  AND p.key = 'question_pools.manage'
ON CONFLICT DO NOTHING;
