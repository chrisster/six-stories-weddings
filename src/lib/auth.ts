import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { hasSupabaseEnv } from "@/lib/env";
import { lookupStudioRole, type AppRole } from "@/lib/studio-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type { AppRole };

export type StudioUser = {
  user: User;
  email: string;
  role: AppRole;
};

/**
 * The signed-in Supabase user. `auth.getUser()` is a network round trip to
 * Supabase Auth, and the layout, the page and the actions of one request all
 * ask for it, so the result is memoized per request with React's cache().
 *
 * Being signed in is not the same as belonging to the studio: use
 * getStudioUser() or the require* guards below to decide access.
 */
export const getCurrentUser = cache(async () => {
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
});

/**
 * Resolves the studio role for the signed-in user. A role comes only from an
 * active admin or crew row in the users table; any other Supabase account, for
 * example one created through the public sign-up endpoint, has no role and no
 * access. Memoized per request like getCurrentUser, so the role lookup runs
 * once even when several components ask for it.
 */
export const getCurrentUserRole = cache(async (): Promise<AppRole | null> => {
  const user = await getCurrentUser();
  if (!user?.email) {
    return null;
  }

  return lookupStudioRole(user.email);
});

/**
 * The signed-in studio member (admin or crew), or null for guests, portal
 * clients and Supabase accounts without a studio role.
 */
export const getStudioUser = cache(async (): Promise<StudioUser | null> => {
  const [user, role] = await Promise.all([getCurrentUser(), getCurrentUserRole()]);
  if (!user?.email || !role) {
    return null;
  }

  return { user, email: user.email.toLowerCase(), role };
});

function denyStudioAccess(signedIn: boolean): never {
  // A signed-in account without a role gets a notice on the sign-in page; the
  // proxy only forwards studio members from "/" to the workspace, so this
  // cannot loop.
  redirect(signedIn ? "/?access=denied" : "/");
}

/**
 * Guard for everything in the studio workspace that crew may use. Server
 * Functions are reachable by direct POST requests, where neither the proxy nor
 * a page-level check runs, so every studio action must call a guard itself.
 * Redirects anyone without a studio role to the sign-in page. Returns null only
 * in demo mode, where there is nothing to protect.
 */
export async function requireStudioUser(): Promise<StudioUser | null> {
  if (!hasSupabaseEnv) {
    return null;
  }

  const member = await getStudioUser();
  if (!member) {
    denyStudioAccess(Boolean(await getCurrentUser()));
  }

  return member;
}

/** Like requireStudioUser, but crew members are sent back to the workspace. */
export async function requireStudioAdmin(): Promise<StudioUser | null> {
  const member = await requireStudioUser();
  if (member && member.role !== "admin") {
    redirect("/admin");
  }

  return member;
}

/** Page guard for studio pages open to crew; demo mode acts as the admin. */
export async function requireStudioRole(): Promise<AppRole> {
  const member = await requireStudioUser();
  return member?.role ?? "admin";
}

/** Redirects everyone but studio admins away from admin-only pages. */
export async function requireAdminRole() {
  const member = await requireStudioAdmin();
  return member?.role ?? null;
}
