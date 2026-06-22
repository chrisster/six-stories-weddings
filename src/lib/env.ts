const requiredVars = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

export const hasSupabaseEnv =
  Boolean(requiredVars.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(requiredVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export function getSupabaseEnv() {
  if (!hasSupabaseEnv) {
    throw new Error("Missing Supabase env vars. Check .env.local.");
  }

  return {
    url: requiredVars.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: requiredVars.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getAppUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}