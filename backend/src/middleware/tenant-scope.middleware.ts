// Clarifying this middleware's purpose before writing anything, per instruction.
//
// The one piece of tenant-identifying data available per-request —
// activeCollegeId — already lives on request.user (see
// modules/auth/auth.types.ts's AuthenticatedUser, populated by
// plugins/authenticate.plugin.ts straight from the JWT's activeCollegeId
// claim). There's no second, uncollected source of truth for a middleware
// to consolidate.
//
// What "tenant-scope middleware" usually implies — automatically injecting
// a `WHERE college_id = ...` constraint into every query for a tenant-scoped
// table — is not something a request-level Fastify hook can actually do in
// this architecture. Query construction happens explicitly inside each
// module's *.repository.ts (see modules/users/users.repository.ts's
// buildListWhere, or getPermissionKeysForUser's collegeId-scoped `or(...)`
// condition). There's no ORM-level interceptor and no Postgres Row-Level
// Security policy wired up that an HTTP-layer middleware could hook into —
// enforcement has to happen at the query, not the request.
//
// So a middleware here could only ever do one of two things, and neither is
// worth building:
//   1. Re-expose request.user.activeCollegeId under a new name (e.g.
//      request.tenantScope = request.user.activeCollegeId) — adds no
//      capability, just a second name for an already-accessible value. Same
//      anti-pattern flagged in plugins/authorize.plugin.ts: duplicating
//      existing state under a different name instead of reusing it directly.
//   2. Silently start enforcing scoping that individual repositories don't
//      currently opt into (e.g. modules/users/users.repository.ts's list()
//      has no automatic college_id restriction today — it's purely an
//      optional, caller-supplied query filter) — which would be a real
//      behavior change smuggled into what's supposed to be a no-op
//      infrastructure phase, not something to do speculatively here.
//
// Deliberately not implementing this. If real tenant-isolation enforcement
// is wanted, it belongs either in each repository's query construction
// (the established pattern already in use) or as Postgres Row-Level
// Security policies on college_id-scoped tables — not as HTTP middleware
// that structurally can't reach the query layer anyway.
export {};
