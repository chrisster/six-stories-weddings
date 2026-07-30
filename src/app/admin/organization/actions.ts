"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserRole } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { prepareSignatureDataUri } from "@/lib/signature-image";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolves the studio countersignature. A newly uploaded file wins; otherwise
 * the existing stored value is carried through unchanged, unless the admin
 * explicitly ticked "remove".
 *
 * The image is stored as a data URI, so it is never round-tripped through a form
 * field — a 45 KB base64 string in a text input is unusable.
 */
async function resolveSignatureImage(formData: FormData): Promise<string | null> {
  if (String(formData.get("removeSignatureImage") || "") === "on") {
    return null;
  }

  const upload = formData.get("signatureImageFile");
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > 5 * 1024 * 1024) {
      redirect("/admin/organization?status=error&reason=" + encodeURIComponent("Signature image must be under 5MB."));
    }
    const buffer = Buffer.from(await upload.arrayBuffer());
    try {
      return await prepareSignatureDataUri(buffer);
    } catch {
      redirect(
        "/admin/organization?status=error&reason=" +
          encodeURIComponent("Could not read that image. Use a PNG or JPEG."),
      );
    }
  }

  const existing = String(formData.get("existingSignatureImage") || "").trim();
  return existing || null;
}

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
    signature_image_url: await resolveSignatureImage(formData),
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
