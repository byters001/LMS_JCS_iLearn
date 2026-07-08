import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env';

// Server-side only, bypasses Row Level Security. Exported for use elsewhere
// within integrations/supabase/ only (storage.ts imports it) — index.ts,
// this folder's public barrel, must never re-export this client or
// SUPABASE_SERVICE_ROLE_KEY itself to code outside this folder.
export const supabaseAdminClient: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Kept for completeness. This backend issues/verifies its own JWTs rather
// than using Supabase Auth, so this client is unlikely to see real use.
export const supabaseAnonClient: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
