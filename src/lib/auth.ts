import { redirect } from "next/navigation";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "crew";

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

/**
 * Resolves the studio role for the signed-in user. Users without an explicit
 * `crew`/`viewer` role in the users table are treated as full admins to
 * preserve existing single-admin behaviour.
 */
export async function getCurrentUserRole(): Promise<AppRole | null> {
  const user = await getCurrentUser();
  if (!user?.email) {
    return null;
  }

  const admin = createAdminClient();
  if (!admin) {
    return "admin";
  }

  const { data } = await admin
    .from("users")
    .select("role")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  const role = String(data?.role || "").toLowerCase();
  if (role === "crew") {
    return "crew";
  }
  return "admin";
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

/** Redirects crew members away from admin-only pages. */
export async function requireAdminRole() {
  if (!hasSupabaseEnv) {
    return null;
  }

  const role = await getCurrentUserRole();
  if (role === "crew") {
    redirect("/admin");
  }
  return role;
}