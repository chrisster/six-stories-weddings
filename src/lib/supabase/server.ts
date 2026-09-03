import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/env";

/**
 * Cookie-backed Supabase client for the current request. One instance per
 * request (React cache), shared by every server component and action that
 * needs the session.
 */
export const createServerSupabaseClient = cache(async () => {
  if (!hasSupabaseEnv) {
    return null;
  }

  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes the session cookie for the studio routes, so the
          // refreshed token is persisted on the next request instead.
        }
      },
    },
  });
});
