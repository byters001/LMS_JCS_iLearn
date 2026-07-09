import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';
import * as identitySchema from './schema/identity.schema';

const schema = { ...identitySchema };

const queryClient = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;

// For server.ts's graceful shutdown (CLAUDE.md non-negotiable #5: drain and
// close the DB pool before exit). drizzle's `db` object doesn't itself
// expose a close/end method — only the underlying postgres.js client does —
// so this is exported the same way redis/client.ts exports disconnectRedis().
export async function closeDatabase(): Promise<void> {
  await queryClient.end();
}
