"use client";

import { useEffect } from "react";

/**
 * Supabase auth recovery links land on the configured Site URL with the token
 * either in the URL hash (`#access_token=...&type=recovery`) or as a `?code=`
 * query param (PKCE). If that lands anywhere other than the reset page, forward
 * the user there with the token preserved so they can set a new password.
 */
export function RecoveryRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/reset-password") return;

    const hash = window.location.hash || "";
    const search = window.location.search || "";

    const isRecovery =
      hash.includes("type=recovery") ||
      hash.includes("access_token") ||
      search.includes("type=recovery") ||
      new URLSearchParams(search).has("code");

    if (!isRecovery) return;

    window.location.replace(`/reset-password${search}${hash}`);
  }, []);

  return null;
}
