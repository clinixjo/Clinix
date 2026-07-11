import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS — use ONLY inside server
 * actions that have already verified the caller (via getProfile) and
 * that derive clinic_id from the caller's session, never from input.
 *
 * `server-only` makes this module a build error if imported into any
 * client component. The key is SUPABASE_SERVICE_ROLE_KEY (never
 * NEXT_PUBLIC).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
