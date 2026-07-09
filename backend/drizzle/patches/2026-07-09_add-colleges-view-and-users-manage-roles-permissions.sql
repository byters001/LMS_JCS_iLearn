-- ============================================================================
-- Patch: add missing permission keys referenced by application code
-- ============================================================================
-- Not a drizzle-kit migration (no drizzle.config.ts / drizzle/migrations/
-- convention exists yet in this project — see drizzle.config.ts, still a
-- stub). This is a plain, hand-run SQL script.
--
-- Reason: an audit of every requirePermission(...) call in the codebase
-- against schema.sql's Section 12 seed data found two permission keys that
-- are referenced in code but were never seeded:
--   - colleges.view      (modules/organization — read-only routes)
--   - users.manage_roles (modules/users — role assignment/revocation routes)
-- Every route gated by these two keys currently denies everyone, including
-- Super Admin, because the permission row simply doesn't exist yet.
--
-- This does NOT touch or duplicate schema.sql's existing seed inserts —
-- schema.sql remains the source of truth for what's already there. This is
-- purely additive: two new rows in `permissions`, granted to super_admin
-- via `role_permissions`, using the same CROSS JOIN shape schema.sql's own
-- seed block uses for that grant.
--
-- Idempotent: safe to run more than once (ON CONFLICT DO NOTHING on both
-- inserts), since there's no migration-tracking table yet to prevent a
-- manual script like this from being re-run by accident.
-- ============================================================================

INSERT INTO permissions (key, module, description) VALUES
  ('colleges.view', 'colleges', 'View college records'),
  ('users.manage_roles', 'users', 'Assign or revoke user role assignments')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'super_admin'
  AND p.key IN ('colleges.view', 'users.manage_roles')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================================
-- END OF PATCH
-- ============================================================================
