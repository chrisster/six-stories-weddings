"use server";

import { revalidatePath } from "next/cache";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContactStatus } from "@/lib/types";

function toNumber(value: FormDataEntryValue | null) {
  const parsed = Number(String(value || "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function createContactAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const eventDate = String(formData.get("eventDate") || "").trim() || null;
  const offerAmount = toNumber(formData.get("offerAmount"));
  const status = String(formData.get("status") || "lead") as ContactStatus;
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!fullName) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const { error } = await admin.from("contacts").insert({
    full_name: fullName,
    email,
    phone,
    event_date: eventDate,
    offer_amount: offerAmount,
    status,
    notes,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/contacts");
}

export async function updateContactStatusAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const contactId = String(formData.get("contactId") || "").trim();
  const status = String(formData.get("status") || "lead") as ContactStatus;
  if (!contactId) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const { error } = await admin.from("contacts").update({ status }).eq("id", contactId);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/contacts");
}

export async function convertContactToClientAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const contactId = String(formData.get("contactId") || "").trim();
  if (!contactId) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const { data: contact, error: contactError } = await admin
    .from("contacts")
    .select("id, full_name, email, phone, converted_client_id")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    throw new Error(contactError?.message || "Contact not found");
  }

  if (contact.converted_client_id) {
    await admin.from("contacts").update({ status: "converted" }).eq("id", contactId);
    revalidatePath("/admin/contacts");
    return;
  }

  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({
      full_name: contact.full_name,
      email: contact.email,
      phone: contact.phone,
      notes: "Converted from contacts pipeline",
    })
    .select("id")
    .single();

  if (clientError || !client) {
    throw new Error(clientError?.message || "Could not create client");
  }

  const { error: updateError } = await admin
    .from("contacts")
    .update({ status: "converted", converted_client_id: client.id })
    .eq("id", contactId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/admin/contacts");
}

export async function createCrewMemberAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const fullName = String(formData.get("fullName") || "").trim();
  const roleType = String(formData.get("roleType") || "assistant").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  if (!fullName) return;
  const admin = createAdminClient();
  if (!admin) return;
  const contactInfo = [email, phone].filter(Boolean).join(" / ") || null;
  await admin.from("crew_members").insert({
    full_name: fullName,
    role_type: roleType,
    contact_info: contactInfo,
    active: true,
  });
  revalidatePath("/admin/contacts");
}

export async function deleteCrewMemberAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const crewMemberId = String(formData.get("crewMemberId") || "").trim();
  if (!crewMemberId) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("crew_members").update({ active: false }).eq("id", crewMemberId);
  revalidatePath("/admin/contacts");
}

export async function updateContactAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const contactId = String(formData.get("contactId") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  if (!contactId || !fullName) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("contacts").update({ full_name: fullName, email, phone, notes }).eq("id", contactId);
  revalidatePath("/admin/contacts");
}

export async function updateCrewMemberAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const crewMemberId = String(formData.get("crewMemberId") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim();
  const roleType = String(formData.get("roleType") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;
  if (!crewMemberId || !fullName) return;
  const admin = createAdminClient();
  if (!admin) return;
  const contactInfo = email || null;
  await admin.from("crew_members").update({ full_name: fullName, role_type: roleType, contact_info: contactInfo }).eq("id", crewMemberId);
  revalidatePath("/admin/contacts");
}

export async function deleteContactAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const contactId = String(formData.get("contactId") || "").trim();
  if (!contactId) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("contacts").delete().eq("id", contactId);
  revalidatePath("/admin/contacts");
}
