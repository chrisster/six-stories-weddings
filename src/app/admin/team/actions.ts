"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserRole } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createCrewLoginAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    redirect("/admin/team?status=error&reason=unavailable");
  }

  const role = await getCurrentUserRole();
  if (role !== "admin") {
    redirect("/admin");
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();

  if (!email || password.length < 8) {
    redirect("/admin/team?status=error&reason=invalid");
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect("/admin/team?status=error&reason=unavailable");
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || null },
  });

  if (createError || !created?.user) {
    redirect(
      `/admin/team?status=error&reason=${encodeURIComponent(createError?.message || "create_failed")}`,
    );
  }

  const { error: upsertError } = await admin.from("users").upsert(
    {
      auth_user_id: created.user.id,
      email,
      full_name: fullName || null,
      role: "crew",
      active: true,
    },
    { onConflict: "email" },
  );

  if (upsertError) {
    redirect(`/admin/team?status=error&reason=${encodeURIComponent(upsertError.message)}`);
  }

  revalidatePath("/admin/team");
  redirect("/admin/team?status=ok");
}

export async function removeCrewLoginAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    redirect("/admin/team?status=error&reason=unavailable");
  }

  const role = await getCurrentUserRole();
  if (role !== "admin") {
    redirect("/admin");
  }

  const userId = String(formData.get("userId") || "").trim();
  const authUserId = String(formData.get("authUserId") || "").trim();

  const admin = createAdminClient();
  if (!admin) {
    redirect("/admin/team?status=error&reason=unavailable");
  }

  if (authUserId) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => null);
  }

  if (userId) {
    await admin.from("users").delete().eq("id", userId);
  }

  revalidatePath("/admin/team");
  redirect("/admin/team?status=removed");
}
