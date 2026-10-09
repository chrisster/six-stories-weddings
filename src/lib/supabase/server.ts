import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/env";

type ServerSupabaseClient = ReturnType<typeof createServerClient>;

// React's cache() only memoizes during a render; in a Route Handler every call
// would build a new client. Two clients that find the same expired session
// both refresh it, and auth-js then discards the slower refresh because the
// cookie changed under it (AuthRefreshDiscardedError), so that caller sees no
// user and the route answers 401. Next creates one cookie store per request,
// so it keys the per-request client here.
const clientsByRequest = new WeakMap<object, ServerSupabaseClient>();

/**
 * Cookie-backed Supabase client for the current request. One instance per
 * request, shared by every server component, action and route handler that
 * needs the session.
 */
export const createServerSupabaseClient = cache(async () => {
  if (!hasSupabaseEnv) {
    return null;
  }

  const cookieStore = await cookies();
  const existing = clientsByRequest.get(cookieStore);
  if (existing) {
    return existing;
  }

  const { url, anonKey } = getSupabaseEnv();

  const client = createServerClient(url, anonKey, {
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
  clientsByRequest.set(cookieStore, client);
  return client;
});
