import { createHash, randomBytes } from "crypto";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a single-use, self-owned password setup/reset token for the given
 * auth user and returns the raw token to embed in an emailed link. The token is
 * only ever consumed when the user submits the reset form (a POST), so email
 * link scanners that prefetch the URL cannot invalidate it, and setting the
 * password uses the admin API directly (no live client session required).
 */
export async function createPasswordSetupToken(
  authUserId: string,
  email: string,
): Promise<string | null> {
  const userId = (authUserId || "").trim();
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!hasSupabaseEnv || !userId || !normalizedEmail) {
    return null;
  }

  const admin = createAdminClient();
  if (!admin) return null;

  const rawToken = `${randomBytes(32).toString("hex")}`;
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  // Invalidate any outstanding tokens for this user before issuing a new one.
  await admin
    .from("password_setup_tokens")
    .delete()
    .eq("auth_user_id", userId)
    .is("used_at", null);

  const { error } = await admin.from("password_setup_tokens").insert({
    auth_user_id: userId,
    email: normalizedEmail,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (error) {
    return null;
  }

  return rawToken;
}

/**
 * Validates a raw token and, if valid, sets the user's password directly via
 * the admin API. Returns a generic result and marks the token as used so it can
 * never be replayed.
 */
export async function redeemPasswordSetupToken(
  rawToken: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = (rawToken || "").trim();
  const password = newPassword || "";

  if (!hasSupabaseEnv) {
    return { ok: false, error: "Authentication is not configured." };
  }
  if (!token) {
    return { ok: false, error: "This link is invalid or has expired. Request a new one." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Use at least 8 characters." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Authentication is not configured." };
  }

  const tokenHash = hashToken(token);
  const { data: row } = await admin
    .from("password_setup_tokens")
    .select("id, auth_user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!row || row.used_at || new Date(String(row.expires_at)).getTime() < Date.now()) {
    return { ok: false, error: "This link is invalid or has expired. Request a new one." };
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(
    String(row.auth_user_id),
    { password },
  );

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  await admin
    .from("password_setup_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id);

  return { ok: true };
}
