import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';
import * as identitySchema from './schema/identity.schema';

const schema = { ...identitySchema };

// max: 6, not postgres.js's higher common defaults — sized against a real
// constraint, not guessed. This Supabase project's pooler runs in SESSION
// mode with a hard, project-wide cap of 15 total connections (confirmed
// live during item 5c's investigation: a single heavy request's own query
// fan-out hit `EMAXCONNSESSION: max clients reached in session mode - max
// clients are limited to pool_size: 15` twice, independent of this app's
// own `max`). 6 leaves real headroom even in the worst realistic case for
// this dev workflow — the backend's `tsx watch` process and a `pnpm test`
// run alive at once in two terminals are two SEPARATE OS processes, each
// opening their own pool up to `max` independently (vitest.config.ts's
// fileParallelism: false keeps the test run itself to one pool, not one
// per file, but that one process is still additional to the dev server's).
// Two such processes at max:6 is 12 of 15, leaving 3 free for a psql
// session or Supabase Studio — at the previous max:10, the same two-process
// case was already at the 15-connection ceiling with zero margin.
//
// A structurally better fix — switching this project's pooler connection
// to TRANSACTION mode (Supavisor, typically port 6543) — was deliberately
// NOT done here. That needs `prepare: false` on this client plus real
// testing of anything relying on session-level Postgres features, and is
// queued as its own follow-up phase, not bundled into this pool-size
// mitigation.
const queryClient = postgres(env.DATABASE_URL, { max: 6 });

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;

// For server.ts's graceful shutdown (CLAUDE.md non-negotiable #5: drain and
// close the DB pool before exit). drizzle's `db` object doesn't itself
// expose a close/end method — only the underlying postgres.js client does —
// so this is exported the same way redis/client.ts exports disconnectRedis().
export async function closeDatabase(): Promise<void> {
  await queryClient.end();
}
