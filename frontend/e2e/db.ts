// DB access for e2e fixture setup/teardown only — never imported by app
// source or by the Vitest suite. Reads backend/.env directly: there is no
// user-creation/password-set HTTP endpoint in this backend phase (confirmed
// by grep — users.schema.ts has no createUser input at all), so seeding a
// login-able fixture student requires writing password_hash directly,
// exactly like the real backend's own login() does it (same `argon2`
// package, same DATABASE_URL). This deliberately crosses the frontend/
// backend boundary that CLAUDE1.md draws for APP code — this file is test
// infrastructure, never bundled into the app itself.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

// frontend's package.json is "type": "module" — Playwright transpiles this
// file to ESM, where __dirname doesn't exist (confirmed live: the first
// run of this script threw ReferenceError: __dirname is not defined).
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function getDbUrl(): string {
  const backendEnvPath = path.resolve(__dirname, '../../backend/.env')
  process.loadEnvFile(backendEnvPath)
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(`DATABASE_URL not found in ${backendEnvPath}`)
  }
  return url
}

export function createDbClient() {
  // max: 1 — these scripts run a handful of sequential queries and exit;
  // the default pool (10) needlessly reserves connections against the
  // shared dev Supabase pooler's own session-mode cap (confirmed live:
  // EMAXCONNSESSION "max clients reached ... limited to pool_size: 15"
  // once enough ad-hoc scripts/tools had connections outstanding this
  // session).
  return postgres(getDbUrl(), { ssl: 'require', max: 1 })
}
