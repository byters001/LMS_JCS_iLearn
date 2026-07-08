# JCS iLearn — Backend

Placement training assessment platform for JCS iLearn. Trainers travel to
partner colleges to run training; students belong to their college;
assessments include MCQ, coding, and psychometric sections.

## Stack

- Node.js, Fastify, TypeScript,pnpm
- Drizzle ORM
- Supabase (Postgres + Storage) — NOT using Supabase Auth
- Redis (Upstash)
- JWT (issued/verified inside this backend)
- Judge0 — self-hosted, separate service, code execution for coding questions
- Pino (logging), Zod (validation)

## Stack

- Node.js, Fastify, TypeScript
- Package manager: pnpm — always use pnpm (pnpm install, pnpm add, pnpm run).
  Never use npm or yarn commands, and never generate package-lock.json or
  yarn.lock. Only pnpm-lock.yaml should exist.
- Drizzle ORM
- Supabase (Postgres + Storage) — NOT using Supabase Auth
- Redis (Upstash)
- JWT (issued/verified inside this backend)
- Judge0 — self-hosted, separate service, code execution for coding questions
- Pino (logging), Zod (validation)

## Current phase

Local development only. Do NOT create Docker, docker-compose, or any
containerization files unless explicitly asked. Docker comes after the
app is fully working, tested, and reviewed.

## Frozen architecture — do not redesign

This is a modular monolith. One deployable backend, one database, strict
internal module boundaries. Do not propose folder renames, restructuring,
or splitting into microservices unless explicitly asked.

### Folder structure
src/
├── config/            env.ts (Zod-validated), constants.ts, index.ts
├── db/
│   ├── schema/         one file per domain, barrel-exported via index.ts
│   ├── client.ts        single shared Drizzle client
│   └── types.ts
├── integrations/
│   ├── supabase/        client.ts, storage.ts, storage.types.ts,
│   │                     storage.constants.ts, index.ts
│   └── judge0/           client.ts, submission.service.ts, judge0.types.ts,
│                         judge0.constants.ts, index.ts
├── redis/              client.ts, keys.ts
├── logger/             index.ts (Pino singleton)
├── plugins/            authenticate, authorize, error-handler,
│                       request-context, rate-limit, cors-helmet,
│                       swagger, health
├── middleware/         tenant-scope, request-id
├── rbac/               permission-cache.ts, require-permission.ts, types.ts
├── modules/            auth, users, organization, students, trainers,
│                       question-bank, assessments, coding, attempts,
│                       reports, analytics, notifications, settings
├── shared/             errors/, types/, utils/, validators/
├── jobs/               leaderboard-rebuild, program-archival,
│                       temp-storage-purge, scheduler
├── events/             event-bus.ts, event-types.ts
├── app.ts              composition root
└── server.ts           entrypoint, graceful shutdown

### Module shape (identical for every module)
modules/<name>/
├── <name>.routes.ts       binds HTTP verb+path, attaches Zod schema + RBAC guard
├── <name>.controller.ts   thin — extracts req data, calls one service method, shapes response. ZERO business logic.
├── <name>.service.ts      all business logic, orchestration, event emission. Throws AppError subclasses only.
├── <name>.repository.ts   ALL Drizzle queries live here, and only here
├── <name>.schema.ts       Zod request/response validation
└── <name>.types.ts        module-local types

### Boundary rules (non-negotiable)

- A module may call another module's **service** function. Never another
  module's repository. Never another module's raw Drizzle query.
- Side effects that aren't a direct dependency (e.g. `attempt.submitted`)
  go through `events/event-bus.ts`. Producer and consumer never import
  each other.
- `reports` and `analytics` are the explicit exception — they're allowed
  to query across module boundaries because their whole purpose is
  cross-cutting aggregation.
- `integrations/supabase/` is the ONLY place allowed to import
  `@supabase/supabase-js`. No module calls the Supabase SDK directly.
- `integrations/judge0/` is the ONLY place allowed to call Judge0's HTTP
  API. `modules/coding/` calls `integrations/judge0/submission.service.ts`,
  never the raw client.
- Dependency flow: `routes → controller → service → repository → db/schema
  → Postgres`. Never sideways into another module's internals, never
  upward from `db/` or `shared/` back into a module.

## Non-negotiable reliability requirements

1. Every outbound call to Judge0 and Supabase has an explicit timeout and
   a bounded retry with exponential backoff — implemented inside
   `integrations/judge0/client.ts` and `integrations/supabase/client.ts`,
   never inline in a module.
2. `integrations/judge0/client.ts` includes a circuit breaker: after
   repeated failures, short-circuit further calls and throw a clear
   "temporarily unavailable" error instead of queuing doomed requests.
3. `/healthz` (liveness) and `/readyz` (checks DB, Redis, Judge0
   reachability) must exist before this is considered production-ready.
4. Idempotency-Key (Redis-backed) is required on the attempts submit
   route and the coding submit route — duplicate submissions from
   double-clicks or network retries must not create duplicate rows.
5. `server.ts` must drain in-flight requests and close the DB pool and
   Redis connection before exiting — no hard kills on deploy/restart.
6. Every module's service throws only `AppError` subclasses from
   `shared/errors/` — never lets a raw DB, Supabase, or Judge0 SDK error
   leak to the caller or into a response body.
7. Rate limiting on `attempts` and `coding` submit routes is scoped per
   assessment/session, not just global per-IP.
8. `SUPABASE_SERVICE_ROLE_KEY`, `JUDGE0_API_KEY`, and both JWT secrets
   must never appear in logs, error responses, or committed files. Real
   values live only in the local `.env`, never pasted into chat or code.
9. All env vars are read through `config/env.ts` (Zod-validated) — no
   `process.env` access anywhere else in the codebase.

## Reference files

- `drizzle/reference/schema.sql` — the authoritative database schema.
  When building a `db/schema/*.schema.ts` file, match this file
  column-for-column, including enums, defaults, and foreign keys. Do not
  invent columns or types not present here.

## Build process

Work happens in phases, one at a time, each in its own session. Do not
build ahead of the current phase or touch files outside the phase's
stated scope without asking first. After each phase, list every file
created/modified so it can be reviewed before moving on.

## Environment variables (see config/env.ts for the authoritative list)

NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGIN, DATABASE_URL, SUPABASE_URL,
SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET,
JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY, REDIS_URL,
JUDGE0_BASE_URL, JUDGE0_API_KEY

## Redis outage behavior

If Redis is unreachable, permission checks, login, and refresh/revocation
all fail closed (throw, surfaced as 500) rather than silently allowing
access. This is deliberate — do not add fail-open fallback behavior
without an explicit decision to do so.

## What not to do

- Do not create Docker/docker-compose files unless explicitly asked.
- Do not rename, move, or restructure existing folders.
- Do not merge modules or collapse the layered shape (routes/controller/
  service/repository) "for simplicity."
- Do not call Supabase or Judge0 SDKs/APIs from anywhere outside their
  designated `integrations/` folder.
- Do not regenerate a whole file when a targeted edit would do.