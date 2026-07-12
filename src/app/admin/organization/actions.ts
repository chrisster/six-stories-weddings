"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserRole } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export async function saveOrganizationSettingsAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    redirect("/admin/organization?status=error");
  }

  const role = await getCurrentUserRole();
  if (role !== "admin") {
    redirect("/admin");
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect("/admin/organization?status=error");
  }

  const payload = {
    id: "default",
    studio_name: String(formData.get("studioName") || "").trim() || null,
    contact_email: String(formData.get("contactEmail") || "").trim() || null,
    reply_to_email: String(formData.get("replyToEmail") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    website: String(formData.get("website") || "").trim() || null,
    address: String(formData.get("address") || "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from("organization_settings").upsert(payload, { onConflict: "id" });
  if (error) {
    redirect(`/admin/organization?status=error&reason=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/organization");
  redirect("/admin/organization?status=saved");
}
