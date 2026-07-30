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
    // Legal identity used by contracts.
    legal_name: String(formData.get("legalName") || "").trim() || null,
    vat_id: String(formData.get("vatId") || "").trim() || null,
    tax_office: String(formData.get("taxOffice") || "").trim() || null,
    registry_no: String(formData.get("registryNo") || "").trim() || null,
    representative_name: String(formData.get("representativeName") || "").trim() || null,
    city: String(formData.get("city") || "").trim() || null,
    bank_name: String(formData.get("bankName") || "").trim() || null,
    bank_iban: String(formData.get("bankIban") || "").trim() || null,
    signature_image_url: String(formData.get("signatureImageUrl") || "").trim() || null,
    contract_cc_email: String(formData.get("contractCcEmail") || "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from("organization_settings").upsert(payload, { onConflict: "id" });
  if (error) {
    redirect(`/admin/organization?status=error&reason=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/organization");
  redirect("/admin/organization?status=saved");
}
