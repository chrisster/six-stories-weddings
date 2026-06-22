"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/env";

export function createClient() {
  if (!hasSupabaseEnv) {
    throw new Error("Supabase env vars are missing.");
  }

  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}