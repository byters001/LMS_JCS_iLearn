import type { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';

const DURATION_PATTERN = /^\d+(s|m|h|d)$/;

// jsonwebtoken's SignOptions.expiresIn is `ms`'s StringValue | number (a
// template-literal type like '15m' | '7d', not a bare string). `ms` itself
// is only a transitive dependency here (via jsonwebtoken), not hoisted into
// this project's own node_modules under pnpm's strict layout, so it can't be
// imported by name — derive the string-only half of the type structurally
// from jsonwebtoken's own (directly-depended-on) types instead.
type JwtExpiry = Exclude<NonNullable<SignOptions['expiresIn']>, number>;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),

  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid connection string')
    .refine(
      (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
      'DATABASE_URL must start with postgres:// or postgresql://',
    ),

  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z
    .string()
    .regex(DURATION_PATTERN, 'JWT_ACCESS_EXPIRY must look like "15m", "1h", or "7d"')
    .transform((value): JwtExpiry => value as JwtExpiry),
  JWT_REFRESH_EXPIRY: z
    .string()
    .regex(DURATION_PATTERN, 'JWT_REFRESH_EXPIRY must look like "15m", "1h", or "7d"')
    .transform((value): JwtExpiry => value as JwtExpiry),

  REDIS_URL: z
    .string()
    .url('REDIS_URL must be a valid connection string')
    .refine(
      (value) => value.startsWith('rediss://'),
      'REDIS_URL must start with rediss:// (Upstash requires TLS)',
    ),

  JUDGE0_BASE_URL: z.string().url('JUDGE0_BASE_URL must be a valid URL'),
  // Optional: a self-hosted Judge0 instance may have no auth enabled at all.
  // Empty string (e.g. an unfilled "JUDGE0_API_KEY=" in .env) is treated the
  // same as unset, rather than failing validation on a blank value.
  JUDGE0_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),

  // Optional, same tier as JUDGE0_API_KEY — email is fire-and-forget,
  // best-effort infrastructure (see notifications.service.ts's module
  // comment), not something the app should refuse to boot over. A missing
  // key means integrations/email/client.ts short-circuits every send with
  // a clear, caught-and-logged error instead of attempting a doomed
  // request; it does NOT mean the backend fails to start, unlike
  // DATABASE_URL/SUPABASE_*/JWT_* which the app cannot function without.
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),

  // Confirmed there's no system_settings 'email.from_address' row to read
  // instead (grepped the whole repo — nothing seeds one, and nothing in
  // this codebase currently reads system_settings at runtime at all; see
  // settings.service.ts's own "item 4" comment). Plain hardcoded env
  // default, same as every other env var with a fallback. This placeholder
  // domain is NOT a Resend-verified sending domain — swap it for a real
  // one before any email actually needs to leave the building.
  EMAIL_FROM_ADDRESS: z
    .string()
    .min(1, 'EMAIL_FROM_ADDRESS must not be empty')
    .default('JCS iLearn <notifications@jcsilearn.app>'),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export const env = Object.freeze(loadEnv());

export type Env = typeof env;
