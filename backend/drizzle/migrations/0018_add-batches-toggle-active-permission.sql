-- Custom SQL migration file, put your code below! --

-- Adds the 'batches.toggle_active' permission key referenced by
-- modules/organization/organization.routes.ts's new PATCH
-- /batches/:id/toggle-active route.
--
-- Needed because the existing 'batches.manage' key (already granted to
-- BOTH super_admin and faculty — see schema.sql's seed data) is too broad
-- for this action: the brief specifically wants toggleBatchActive
-- restricted to super_admin only, narrower than every other batches.*
-- route. This codebase has no role-slug-based route guard at all (checked
-- rbac/require-permission.ts directly — requirePermission()/
-- requireAnyPermission() are the only two guards, both permission-key-based,
-- and request.user carries no `roles` array to check directly either — see
-- plugins/authenticate.plugin.ts). So "super_admin only" is expressed the
-- same way every other super-admin-only action in this codebase already is:
-- a dedicated permission key granted to super_admin alone. Same mechanism as
-- 0003/0005/0009/0016: a tracked drizzle-kit --custom migration, not a
-- hand-run ad hoc script.
INSERT INTO permissions (key, module, description) VALUES
  ('batches.toggle_active', 'batches', 'Toggle whether a batch is active or archived');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'super_admin'
  AND p.key = 'batches.toggle_active';