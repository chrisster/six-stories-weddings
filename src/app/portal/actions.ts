"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { resolvePortalClaim, sendPortalAccessLink } from "@/lib/portal-access";
import { clearPortalSession, createPortalSession } from "@/lib/portal-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export async function portalLoginAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    redirect("/portal/login?error=Portal is unavailable in demo mode.");
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const nextPath = String(formData.get("next") || "").trim();
  const safeNextPath = nextPath.startsWith("/") ? nextPath : "/portal";

  if (!email || !password) {
    redirect("/portal/login?error=Enter your email and password.");
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect("/portal/login?error=Portal is unavailable right now.");
  }

  const { data: account } = await admin
    .from("client_portal_accounts")
    .select("id, email, password_hash, is_active")
    .eq("email", email)
    .maybeSingle();

  if (!account || !account.password_hash || !account.is_active) {
    redirect("/portal/login?error=No active portal account was found for that email.");
  }

  const valid = await bcrypt.compare(password, String(account.password_hash));
  if (!valid) {
    redirect("/portal/login?error=Incorrect email or password.");
  }

  await admin
    .from("client_portal_accounts")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", account.id);

  await createPortalSession(String(account.id), String(account.email));
  redirect(safeNextPath);
}

export async function portalLogoutAction() {
  await clearPortalSession();
  redirect("/portal/login");
}

export async function completePortalClaimAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    redirect("/portal/login?error=Portal is unavailable in demo mode.");
  }

  const token = String(formData.get("token") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  const claim = await resolvePortalClaim(token);
  if (!claim) {
    redirect("/portal/forgot?error=expired");
  }

  if (password.length < 8) {
    redirect(`/portal/claim?token=${encodeURIComponent(token)}&error=Use at least 8 characters.`);
  }

  if (password !== confirmPassword) {
    redirect(`/portal/claim?token=${encodeURIComponent(token)}&error=Passwords do not match.`);
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect("/portal/login?error=Portal is unavailable right now.");
  }

  const now = new Date().toISOString();
  const fields = {
    password_hash: await bcrypt.hash(password, 10),
    is_active: true,
    last_login_at: now,
    updated_at: now,
  };

  // The write only matches the password hash the link was issued for, so a
  // link sets a password once, even when the form is submitted twice at once.
  let account: { id: string; email: string } | null = null;
  if (claim.accountId) {
    const update = admin.from("client_portal_accounts").update(fields).eq("id", claim.accountId);
    const { data } = await (claim.passwordHash
      ? update.eq("password_hash", claim.passwordHash)
      : update.is("password_hash", null)
    ).select("id, email");
    account = data?.[0] ?? null;
  } else {
    const { data } = await admin
      .from("client_portal_accounts")
      .insert({ email: claim.email, ...fields })
      .select("id, email")
      .maybeSingle();
    account = data ?? null;
  }

  if (!account) {
    redirect("/portal/forgot?error=expired");
  }

  await createPortalSession(String(account.id), String(account.email));
  redirect("/portal");
}

export async function requestPortalAccessLinkAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    redirect("/portal/forgot?error=unavailable");
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) {
    redirect("/portal/forgot?error=email");
  }

  // Sent after the response, and the answer is the same either way, so neither
  // the message nor the timing tells anyone which addresses are clients.
  after(() => sendPortalAccessLink({ email, requestedByClient: true }));
  redirect("/portal/forgot?sent=1");
}
