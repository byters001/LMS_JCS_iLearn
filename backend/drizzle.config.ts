import { defineConfig } from 'drizzle-kit';
import { env } from './src/config/env';

// Reuses config/env.ts's already-validated DATABASE_URL rather than reading
// process.env directly here — same source of truth the app itself uses.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
