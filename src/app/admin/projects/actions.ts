"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

function toNumber(value: FormDataEntryValue | null) {
  const parsed = Number(String(value || "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function createProjectAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const title = String(formData.get("title") || "").trim();
  const eventDate = String(formData.get("eventDate") || "").trim();
  const projectType = String(formData.get("projectType") || "Wedding").trim();
  const status = String(formData.get("status") || "unconfirmed").trim();
  const editingStatus = String(formData.get("editingStatus") || "not_started").trim();
  const notes = String(formData.get("notes") || "").trim() || null;
  const budgetTotal = toNumber(formData.get("budgetTotal"));
  const amountPaid = toNumber(formData.get("amountPaid"));
  const amountRemaining = Math.max(0, budgetTotal - amountPaid);

  const clientName = String(formData.get("clientName") || "").trim();
  const clientEmail = String(formData.get("clientEmail") || "").trim() || null;
  const clientPhone = String(formData.get("clientPhone") || "").trim() || null;

  if (!title || !eventDate) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({
      title,
      event_date: eventDate,
      month: eventDate.slice(0, 7),
      project_type: projectType,
      status,
      editing_status: editingStatus,
      budget_total: budgetTotal,
      amount_paid: amountPaid,
      amount_remaining: amountRemaining,
      notes,
    })
    .select("id, title")
    .single();

  if (projectError || !project) {
    throw new Error(projectError?.message || "Could not create project");
  }

  if (clientName) {
    const { data: client, error: clientError } = await admin
      .from("clients")
      .insert({
        full_name: clientName,
        email: clientEmail,
        phone: clientPhone,
      })
      .select("id")
      .single();

    if (clientError || !client) {
      throw new Error(clientError?.message || "Could not create client");
    }

    const { error: linkError } = await admin.from("project_clients").insert({
      project_id: project.id,
      client_id: client.id,
      role: "couple",
    });

    if (linkError) {
      throw new Error(linkError.message);
    }
  }

  const baseSlug = slugify(String(project.title || title));
  const slug = `${baseSlug || "wedding"}-${randomUUID().slice(0, 8)}`;

  await admin.from("galleries").insert({
    project_id: project.id,
    slug,
    title: `${title} Gallery`,
    is_published: false,
    allow_downloads: false,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  revalidatePath("/admin/galleries");
}

export async function updateProjectAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const projectId = String(formData.get("projectId") || "").trim();
  if (!projectId) {
    return;
  }

  const title = String(formData.get("title") || "").trim();
  const eventDate = String(formData.get("eventDate") || "").trim();
  const projectType = String(formData.get("projectType") || "Wedding").trim();
  const status = String(formData.get("status") || "unconfirmed").trim();
  const editingStatus = String(formData.get("editingStatus") || "not_started").trim();
  const notes = String(formData.get("notes") || "").trim() || null;
  const budgetTotal = toNumber(formData.get("budgetTotal"));
  const amountPaid = toNumber(formData.get("amountPaid"));
  const amountRemaining = Math.max(0, budgetTotal - amountPaid);

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const { error } = await admin
    .from("projects")
    .update({
      title,
      event_date: eventDate,
      month: eventDate ? eventDate.slice(0, 7) : null,
      project_type: projectType,
      status,
      editing_status: editingStatus,
      budget_total: budgetTotal,
      amount_paid: amountPaid,
      amount_remaining: amountRemaining,
      notes,
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
  revalidatePath("/admin");
}

export async function updateClientAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const projectId = String(formData.get("projectId") || "").trim();
  const clientId = String(formData.get("clientId") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;

  if (!projectId || !clientId || !fullName) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const { error } = await admin
    .from("clients")
    .update({
      full_name: fullName,
      email,
      phone,
    })
    .eq("id", clientId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
}

export async function addClientToProjectAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const projectId = String(formData.get("projectId") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;

  if (!projectId || !fullName) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({
      full_name: fullName,
      email,
      phone,
    })
    .select("id")
    .single();

  if (clientError || !client) {
    throw new Error(clientError?.message || "Could not create client");
  }

  const { error: linkError } = await admin.from("project_clients").insert({
    project_id: projectId,
    client_id: client.id,
    role: "couple",
  });

  if (linkError) {
    throw new Error(linkError.message);
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
}