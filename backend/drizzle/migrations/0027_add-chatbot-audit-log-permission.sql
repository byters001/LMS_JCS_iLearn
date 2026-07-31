-- Custom SQL migration file, put your code below! --

-- Adds the 'chatbot.audit_log' permission key for the new GET
-- /chatbot/queries endpoint (modules/chatbot/chatbot.routes.ts) —
-- confirmed via grep against schema.sql's INSERT INTO permissions block
-- plus every migration since that nothing named 'chatbot.audit_log' was
-- already seeded (only 'chatbot.query' exists, from 0022).
--
-- Deliberately a SEPARATE key from 'chatbot.query', not a reuse — this
-- task's own requirement is "super_admin only... this is audit/security
-- data, not a general staff feature," but 'chatbot.query' is already
-- seeded to BOTH super_admin and faculty (0022). Widening that existing
-- key's meaning to also gate the audit log would hand faculty read access
-- to every user's chatbot_query_log rows (including rejected/malformed
-- function-call attempts from OTHER users) as an accidental side effect
-- of a key whose actual purpose is just "may ask the chatbot." Same
-- "distinct key keeps its own scope legible" reasoning 0022's own comment
-- already gave for not reusing 'analytics.view'.
--
-- Seeded to super_admin ONLY (unlike 0022's both-roles grant) — per this
-- task's explicit ask. super_admin's blanket grant-all INSERT in
-- schema.sql only ran once at initial seed time and does not retroactively
-- cover keys added by later migrations, so it needs the explicit grant
-- here too, same as every prior permission-adding migration in this
-- project (0003, 0005, 0009, 0016, 0018, 0022, 0023, 0025).
--
-- Tracked drizzle-kit migration (`drizzle-kit generate --custom`), not a
-- hand-run ad hoc script — same mechanism as every migration above.
INSERT INTO permissions (key, module, description) VALUES
  ('chatbot.audit_log', 'chatbot', 'View the chatbot query audit log, including rejected/unresolved function-call attempts');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'super_admin'
  AND p.key = 'chatbot.audit_log';
