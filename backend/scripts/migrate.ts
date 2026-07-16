// Bypasses drizzle-kit's CLI (`drizzle-kit migrate`) — that CLI renders a
// progress spinner while it runs and, on failure, has been observed to
// print a generic/truncated error with no `.cause` chain, hiding the real
// underlying Postgres error. This script imports drizzle-orm's own
// `migrate()` directly and prints the full error object (message, cause,
// stack) with nothing swallowed.
//
// Run with: pnpm exec tsx --env-file=.env scripts/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../src/config/env';

const MIGRATIONS_FOLDER = new URL('../drizzle/migrations', import.meta.url).pathname.replace(
  /^\/([a-zA-Z]:)/,
  '$1',
); // strips the leading '/' Windows file URLs get in front of a drive letter

async function runDiagnostics(sql: postgres.Sql, label: string): Promise<void> {
  console.log(`\n--- Diagnostics (${label}) ---`);

  const tableExists = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'chatbot_query_log'
    ) AS exists
  `;
  console.log('1. chatbot_query_log in information_schema.tables:', tableExists[0]?.exists);

  let migrationRowCount: unknown = '(drizzle schema/table not found)';
  try {
    const rows = await sql`SELECT COUNT(*)::int AS count FROM drizzle.__drizzle_migrations`;
    migrationRowCount = rows[0]?.count;
  } catch (err) {
    migrationRowCount = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
  console.log('2. drizzle.__drizzle_migrations row count:', migrationRowCount);

  let permissionExists: unknown = '(permissions table not found)';
  try {
    const rows = await sql`
      SELECT EXISTS (SELECT FROM permissions WHERE key = 'chatbot.query') AS exists
    `;
    permissionExists = rows[0]?.exists;
  } catch (err) {
    permissionExists = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
  console.log("3. 'chatbot.query' row in permissions:", permissionExists);
}

async function main(): Promise<void> {
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);

  try {
    await runDiagnostics(sql, 'BEFORE migrate() attempt');

    console.log('\n--- Running migrate() directly (drizzle-orm/postgres-js/migrator) ---');
    console.log('migrationsFolder:', MIGRATIONS_FOLDER);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log('migrate() completed without throwing.');
  } catch (err) {
    console.error('\n--- migrate() THREW — full error, nothing swallowed ---');
    if (err instanceof Error) {
      console.error('name:', err.name);
      console.error('message:', err.message);
      console.error('stack:', err.stack);
      // Node's Error.cause (and postgres.js's own PostgresError often
      // carries the real server-side detail here) — this is exactly what
      // the CLI's spinner output was dropping.
      console.error('cause:', (err as { cause?: unknown }).cause);
      // postgres.js errors also carry these fields directly on the error
      // object, not nested under .cause — print them explicitly in case
      // this IS a PostgresError.
      const pgErr = err as Record<string, unknown>;
      for (const field of ['code', 'detail', 'hint', 'schema_name', 'table_name', 'column_name', 'constraint_name', 'severity', 'routine']) {
        if (field in pgErr) {
          console.error(`  ${field}:`, pgErr[field]);
        }
      }
    } else {
      console.error('non-Error thrown:', err);
    }
  } finally {
    await runDiagnostics(sql, 'AFTER migrate() attempt');
    await sql.end();
  }
}

main();
