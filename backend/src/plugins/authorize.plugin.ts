// Clarifying this plugin's purpose before writing anything, per instruction.
//
// CLAUDE.md's plugin list names "authenticate" and "authorize" side by
// side, as if they're two parallel Fastify-decorator-based guards
// (fastify.authenticate, fastify.authorize). In practice, the RBAC
// implementation that actually got built — rbac/require-permission.ts —
// already fully covers what an "authorize" plugin would do:
// requirePermission(key) is a preHandler factory, imported directly into
// route files and composed as
// `preHandler: [fastify.authenticate, requirePermission('some.key')]`
// (see modules/auth/auth.routes.ts, modules/users/users.routes.ts).
//
// Wrapping that same function here as
// `fastify.decorate('authorize', requirePermission)` would add no new
// capability — just a second name for the exact same check. Two ways to
// reach identical logic (`fastify.authorize('key')` vs.
// `requirePermission('key')` imported directly) is a real footgun: routes
// will inconsistently pick one or the other, and if require-permission.ts's
// internals ever change, a forgotten decorator wrapper here would silently
// drift out of sync with it. That's exactly the "duplicate logic under a
// different name" this task explicitly warned against.
//
// Deliberately not implementing this plugin. A genuinely different
// authorization concern — concrete resource-ownership checks, e.g. "can
// this user touch this specific record," as opposed to "does this user
// hold this permission key" — would be a real reason to build this out.
// That distinction already came up once: modules/users/users.controller.ts's
// assertCanManageAvatar (self-id-or-users.manage_roles) is exactly this
// kind of check, added ad hoc and inline because only one call site needed
// it, with an explicit note that it's worth consolidating into a shared
// helper if more routes need the same shape. If/when that happens, this
// file is the natural home for it — not a rebuild of
// rbac/require-permission.ts under a new name.
export {};
