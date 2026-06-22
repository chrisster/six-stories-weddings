import { redirect } from "next/navigation";

import { hasSupabaseEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  if (!hasSupabaseEnv) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function requireAdminUser() {
  if (!hasSupabaseEnv) {
    return null;
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return user;
}