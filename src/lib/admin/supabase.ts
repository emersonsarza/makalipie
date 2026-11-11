import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./env";

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/** Publishable key. This client signs in and refreshes one user, then it is discarded. */
export function createAuthClient(): SupabaseClient {
  const { url, publishableKey } = readSupabaseEnv();
  return createClient(url, publishableKey, { auth: authOptions });
}

/** Secret key. Bypasses row security. Never reuse it as a signed-in user client. */
export function createServiceClient(): SupabaseClient {
  const { url, secretKey } = readSupabaseEnv();
  return createClient(url, secretKey, { auth: authOptions });
}
