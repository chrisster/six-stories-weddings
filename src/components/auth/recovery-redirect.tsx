"use client";

import { useEffect } from "react";

/**
 * Supabase password recovery links land on the site's configured Site URL with
 * the access token in the URL hash (e.g. `/#access_token=...&type=recovery`).
 * If that lands anywhere other than the reset page, forward the user there with
 * the hash preserved so they can set a new password.
 */
export function RecoveryRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    if (!hash.includes("type=recovery") && !hash.includes("access_token")) return;
    if (window.location.pathname === "/reset-password") return;
    window.location.replace(`/reset-password${hash}`);
  }, []);

  return null;
}
