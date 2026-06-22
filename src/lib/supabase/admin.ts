import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/env";

export function createAdminClient() {
  if (!hasSupabaseEnv) {
    return null;
  }

  const { url, serviceRoleKey } = getSupabaseEnv();
  if (!serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}