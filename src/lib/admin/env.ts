export const OWNER_EMAIL = "nika@makalipie.com";

export type SupabaseEnv = {
  url: string;
  publishableKey: string;
  secretKey: string;
};

export function readSupabaseEnv(): SupabaseEnv {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
  if (!url || !publishableKey || !secretKey) {
    throw new Error("SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY are required.");
  }
  return { url, publishableKey, secretKey };
}
