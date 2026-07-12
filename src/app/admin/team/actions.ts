"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserRole } from "@/lib/auth";
import { getAppUrl, hasSupabaseEnv } from "@/lib/env";
import { sendGalleryNotificationEmail } from "@/lib/gallery-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

const SPECIALTIES = ["photographer", "videographer", "editor", "assistant", "partner"] as const;

function normalizeSpecialty(value: string): (typeof SPECIALTIES)[number] {
  const lower = value.trim().toLowerCase();
  return (SPECIALTIES as readonly string[]).includes(lower)
    ? (lower as (typeof SPECIALTIES)[number])
    : "assistant";
}

async function requireAdmin() {
  const role = await getCurrentUserRole();
  if (role !== "admin") {
    redirect("/admin");
  }
}

export async function createCrewAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    redirect("/admin/team?status=error&reason=unavailable");
  }
  await requireAdmin();

  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase() || null;
  const roleType = normalizeSpecialty(String(formData.get("roleType") || "assistant"));

  if (!fullName) {
    redirect("/admin/team?status=error&reason=invalid");
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect("/admin/team?status=error&reason=unavailable");
  }

  const { error } = await admin.from("crew_members").insert({
    full_name: fullName,
    role_type: roleType,
    email,
    contact_info: email,
    active: true,
  });

  if (error) {
    redirect(`/admin/team?status=error&reason=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/team");
  redirect("/admin/team?status=created");
}

export async function updateCrewAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    redirect("/admin/team?status=error&reason=unavailable");
  }
  await requireAdmin();

  const crewMemberId = String(formData.get("crewMemberId") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase() || null;
  const roleType = normalizeSpecialty(String(formData.get("roleType") || "assistant"));

  if (!crewMemberId || !fullName) {
    redirect("/admin/team?status=error&reason=invalid");
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect("/admin/team?status=error&reason=unavailable");
  }

  await admin
    .from("crew_members")
    .update({ full_name: fullName, role_type: roleType, email, contact_info: email })
    .eq("id", crewMemberId);

  revalidatePath("/admin/team");
  redirect("/admin/team?status=updated");
}

export async function inviteCrewAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    redirect("/admin/team?status=error&reason=unavailable");
  }
  await requireAdmin();

  const crewMemberId = String(formData.get("crewMemberId") || "").trim();
  if (!crewMemberId) {
    redirect("/admin/team?status=error&reason=invalid");
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect("/admin/team?status=error&reason=unavailable");
  }

  const { data: member } = await admin
    .from("crew_members")
    .select("id, full_name, email, contact_info, auth_user_id")
    .eq("id", crewMemberId)
    .maybeSingle();

  const email = String(member?.email || member?.contact_info || "").trim().toLowerCase();
  const fullName = String(member?.full_name || "").trim();

  if (!member || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/admin/team?status=error&reason=no_email");
  }

  const appUrl = getAppUrl().replace(/\/$/, "");
  const redirectTo = `${appUrl}/reset-password`;

  // Create the auth user if it doesn't exist yet (ignore "already exists").
  let authUserId = (member.auth_user_id as string | null) || null;
  const tempPassword = `${randomUUID()}Aa1!`;
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName || null },
  });
  if (created?.user?.id) {
    authUserId = created.user.id;
  }

  // Generate a set-password (recovery) link and email it via our own SMTP.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (linkError || !linkData) {
    redirect(`/admin/team?status=error&reason=${encodeURIComponent(linkError?.message || "link_failed")}`);
  }

  if (linkData.user?.id) {
    authUserId = linkData.user.id;
  }
  const actionLink =
    (linkData.properties?.action_link as string | undefined) || redirectTo;

  await admin.from("users").upsert(
    {
      auth_user_id: authUserId,
      email,
      full_name: fullName || null,
      role: "crew",
      active: true,
    },
    { onConflict: "email" },
  );

  await admin.from("crew_members").update({ auth_user_id: authUserId }).eq("id", crewMemberId);

  const subject = "Your Six Stories Studio crew access";
  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;background:#f3f1ee;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;">
        <p style="margin:0 0 8px;color:#2d2d2d;letter-spacing:0.12em;text-transform:uppercase;">Six Stories</p>
        <h1 style="margin:0 0 16px;font-size:20px;color:#202020;">Crew access invitation</h1>
        <p style="margin:0 0 16px;color:#474747;font-size:14px;line-height:1.7;">
          ${fullName ? `Hi ${fullName},` : "Hi,"} you have been given crew access to the Six Stories
          Studio workspace. Click below to set your password and sign in.
        </p>
        <p style="margin:0 0 24px;">
          <a href="${actionLink}" style="display:inline-block;padding:12px 22px;background:#1c1c1c;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.08em;">Set your password</a>
        </p>
        <p style="margin:0;color:#8a857d;font-size:12px;line-height:1.6;">
          If the button does not work, copy and paste this link:<br />${actionLink}
        </p>
      </div>
    </div>`;
  const text = `You have crew access to Six Stories Studio.\n\nSet your password: ${actionLink}`;

  try {
    await sendGalleryNotificationEmail({ to: email, subject, html, text });
  } catch (error) {
    console.error("inviteCrewAction email failed", { email, error });
    redirect("/admin/team?status=error&reason=email_failed");
  }

  revalidatePath("/admin/team");
  redirect("/admin/team?status=invited");
}

export async function removeCrewAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    redirect("/admin/team?status=error&reason=unavailable");
  }
  await requireAdmin();

  const crewMemberId = String(formData.get("crewMemberId") || "").trim();
  const authUserId = String(formData.get("authUserId") || "").trim();

  const admin = createAdminClient();
  if (!admin) {
    redirect("/admin/team?status=error&reason=unavailable");
  }

  if (authUserId) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => null);
    await admin.from("users").delete().eq("auth_user_id", authUserId);
  }

  if (crewMemberId) {
    await admin
      .from("crew_members")
      .update({ active: false, auth_user_id: null })
      .eq("id", crewMemberId);
  }

  revalidatePath("/admin/team");
  redirect("/admin/team?status=removed");
}
