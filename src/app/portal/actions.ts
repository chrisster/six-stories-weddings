"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import { clearPortalSession, createPortalSession, verifyPortalClaimToken } from "@/lib/portal-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export async function portalLoginAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    redirect("/portal/login?error=Portal is unavailable in demo mode.");
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

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
  redirect("/portal");
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

  const claim = verifyPortalClaimToken(token);
  if (!claim) {
    redirect("/portal/login?error=This access link has expired. Ask us to send a fresh one.");
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

  const passwordHash = await bcrypt.hash(password, 10);
  const { data: account, error } = await admin
    .from("client_portal_accounts")
    .upsert(
      {
        email: claim.email,
        password_hash: passwordHash,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    )
    .select("id, email")
    .single();

  if (error || !account) {
    redirect("/portal/login?error=Could not activate your portal access.");
  }

  await createPortalSession(String(account.id), String(account.email));
  redirect("/portal");
}