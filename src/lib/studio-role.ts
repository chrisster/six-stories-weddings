import { createAdminClient } from "@/lib/supabase/admin";

export type AppRole = "admin" | "crew";

/**
 * The studio role recorded for an email. Only an active row in the users table
 * with an explicit admin or crew role grants one (the team page creates such a
 * row for every member it invites); anything else is no role at all. Kept apart
 * from src/lib/auth.ts so the proxy, which has no request-scoped cookies() or
 * React cache, can use it too.
 */
export async function lookupStudioRole(email: string): Promise<AppRole | null> {
  const normalized = email.trim().toLowerCase();
  const admin = createAdminClient();
  if (!normalized || !admin) {
    return null;
  }

  const { data } = await admin
    .from("users")
    .select("role, active")
    .eq("email", normalized)
    .maybeSingle();

  if (!data || data.active === false) {
    return null;
  }

  const role = String(data.role || "").toLowerCase();
  return role === "admin" || role === "crew" ? role : null;
}
