"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

function toNumber(value: FormDataEntryValue | null) {
  const parsed = Number(String(value || "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEventDate(rawDate: string): string {
  const trimmed = rawDate.trim();
  if (!trimmed) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    return `${trimmed.slice(6)}-${trimmed.slice(3, 5)}-${trimmed.slice(0, 2)}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return `${trimmed.slice(6)}-${trimmed.slice(3, 5)}-${trimmed.slice(0, 2)}`;
  }

  return "";
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

type ServiceType = "photo" | "film";

function normalizeEventType(raw: string): "wedding" | "baptism" {
  return raw.trim().toLowerCase() === "baptism" ? "baptism" : "wedding";
}

function normalizeServices(values: string[]): ServiceType[] {
  const next = values
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is ServiceType => value === "photo" || value === "film");

  return Array.from(new Set(next));
}

function parseLegacyProjectType(projectType: string): { eventType: "wedding" | "baptism"; services: ServiceType[] } {
  if (projectType.includes("|")) {
    const [labelRaw, servicesRaw = ""] = projectType.split("|");
    const eventType = normalizeEventType(labelRaw);
    const services = normalizeServices(servicesRaw.split(","));
    return { eventType, services };
  }

  const lower = projectType.toLowerCase();
  const eventType = lower.includes("baptism") ? "baptism" : "wedding";
  const services: ServiceType[] = [];
  if (lower.includes("photography")) services.push("photo");
  if (lower.includes("film")) services.push("film");
  return { eventType, services };
}

function buildProjectType(eventType: "wedding" | "baptism", services: ServiceType[]): string {
  const label = eventType === "baptism" ? "Baptism" : "Wedding";
  const normalized = services.length > 0 ? services : ["photo", "film"];
  return `${label}|${normalized.join(",")}`;
}

export async function createProjectAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const manualTitle = String(formData.get("title") || "").trim();
  const eventDate = String(formData.get("eventDate") || "").trim();

  const servicesRaw = String(formData.get("services") || "");
  const rawEventType = String(formData.get("eventType") || "wedding");
  const eventType = normalizeEventType(rawEventType);
  const services = normalizeServices(servicesRaw.split(","));
  const projectType = buildProjectType(eventType, services);

  // Always create as draft initially
  const status = "draft";
  const notes = String(formData.get("notes") || "").trim() || null;
  const budgetTotal = toNumber(formData.get("budgetTotal"));
  const amountPaid = toNumber(formData.get("amountPaid"));
  const amountRemaining = Math.max(0, budgetTotal - amountPaid);

  // Structured client + crew data from client component
  let clientsData: {
    contactId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    notes: string;
  }[] = [];
  let crewData: {
    crewMemberId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    roleType: string;
    assignmentRole: string;
  }[] = [];

  try {
    const raw = String(formData.get("clientsData") || "[]");
    clientsData = JSON.parse(raw);
  } catch {
    clientsData = [];
  }

  try {
    const raw = String(formData.get("crewData") || "[]");
    crewData = JSON.parse(raw);
  } catch {
    crewData = [];
  }

  if (!eventDate) {
    return;
  }

  const coupleNames = clientsData
    .map((entry) => [entry.firstName, entry.lastName].filter(Boolean).join(" ").trim())
    .filter(Boolean)
    .slice(0, 2);
  const generatedTitle = coupleNames.length > 0 ? coupleNames.join(" & ") : "Untitled Couple";
  const title = manualTitle || generatedTitle;

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

  // Create clients
  for (const entry of clientsData) {
    const fullName = [entry.firstName, entry.lastName].filter(Boolean).join(" ").trim();
    if (!fullName) continue;

    const { data: client, error: clientError } = await admin
      .from("clients")
      .insert({
        full_name: fullName,
        email: entry.email || null,
        phone: entry.phone || null,
        notes: entry.notes || null,
      })
      .select("id")
      .single();

    if (clientError || !client) continue;

    await admin.from("project_clients").insert({
      project_id: project.id,
      client_id: client.id,
      role: "couple",
    });

    // Mirror to contacts (skip if email already exists)
    const contactEmail = entry.email || null;
    if (contactEmail) {
      const { data: existing } = await admin
        .from("contacts")
        .select("id")
        .eq("email", contactEmail)
        .maybeSingle();
      if (!existing) {
        await admin.from("contacts").insert({
          full_name: fullName,
          email: contactEmail,
          phone: entry.phone || null,
          notes: entry.notes || null,
          status: "confirmed",
          converted_client_id: client.id,
        });
      }
    } else {
      await admin.from("contacts").insert({
        full_name: fullName,
        email: null,
        phone: entry.phone || null,
        notes: entry.notes || null,
        status: "confirmed",
        converted_client_id: client.id,
      });
    }
  }

  // Create / assign crew
  for (const entry of crewData) {
    let crewMemberId = entry.crewMemberId || "";

    if (!crewMemberId) {
      const fullName = [entry.firstName, entry.lastName].filter(Boolean).join(" ").trim();
      if (!fullName) continue;

      const { data: member } = await admin
        .from("crew_members")
        .insert({
          full_name: fullName,
          role_type: entry.roleType || "assistant",
          contact_info: entry.email || entry.phone || null,
        })
        .select("id")
        .single();

      crewMemberId = member?.id || "";
    }

    if (!crewMemberId) continue;

    await admin.from("crew_assignments").insert({
      project_id: project.id,
      crew_member_id: crewMemberId,
      assignment_role: entry.assignmentRole || entry.roleType || "crew",
    });
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

  redirect(`/admin/projects/${project.id}`);
}

export async function deleteProjectAction(formData: FormData) {
  if (!hasSupabaseEnv) return;

  const projectId = String(formData.get("projectId") || "").trim();
  if (!projectId) return;

  const admin = createAdminClient();
  if (!admin) return;

  await admin.from("projects").delete().eq("id", projectId);

  revalidatePath("/admin");
  revalidatePath("/admin/galleries");
  redirect("/admin");
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
  const rawDate = String(formData.get("eventDate") || "").trim();
  const eventDate = normalizeEventDate(rawDate);
  if (!eventDate) {
    redirect(`/admin/projects/${projectId}?save=error&reason=date`);
  }
  const fallbackProjectType = String(formData.get("projectType") || "").trim();
  const parsedFallback = parseLegacyProjectType(fallbackProjectType || "Wedding");
  const eventType = normalizeEventType(String(formData.get("eventType") || parsedFallback.eventType));
  const services = normalizeServices(
    formData
      .getAll("services")
      .map((value) => String(value)),
  );
  const projectType = buildProjectType(eventType, services.length > 0 ? services : parsedFallback.services);
  const status = String(formData.get("status") || "draft").trim();
  const referral = String(formData.get("referral") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const budgetTotal = toNumber(formData.get("budgetTotal"));
  const amountPaid = toNumber(formData.get("amountPaid"));
  const amountRemaining = Math.max(0, budgetTotal - amountPaid);

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const payload = {
    title,
    event_date: eventDate,
    month: eventDate ? eventDate.slice(0, 7) : null,
    project_type: projectType,
    status,
    referral,
    budget_total: budgetTotal,
    amount_paid: amountPaid,
    amount_remaining: amountRemaining,
    notes,
  };

  let { error } = await admin
    .from("projects")
    .update(payload)
    .eq("id", projectId);

  // Compatibility fallback for DBs where referral column has not been migrated yet.
  if (error?.message?.toLowerCase().includes("referral")) {
    const { referral: _ignored, ...payloadWithoutReferral } = payload;
    const retry = await admin
      .from("projects")
      .update(payloadWithoutReferral)
      .eq("id", projectId);
    error = retry.error;
  }

  if (error) {
    console.error("updateProjectAction failed", {
      projectId,
      message: error.message,
      status,
      eventDate,
      projectType,
    });
    redirect(
      `/admin/projects/${projectId}?save=error&reason=server&detail=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
  revalidatePath("/admin");
  redirect(`/admin/projects/${projectId}?save=ok`);
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

export async function removeClientFromProjectAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const projectId = String(formData.get("projectId") || "").trim();
  const clientId = String(formData.get("clientId") || "").trim();
  if (!projectId || !clientId) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("project_clients").delete().match({ project_id: projectId, client_id: clientId });
  revalidatePath(`/admin/projects/${projectId}`);
}

export async function addCrewToProjectAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const projectId = String(formData.get("projectId") || "").trim();
  const crewMemberId = String(formData.get("crewMemberId") || "").trim();
  const assignmentRole = String(formData.get("assignmentRole") || "crew").trim();
  const participantType = String(formData.get("participantType") || "inhouse").trim();
  const rawFee = formData.get("freelancerFee");
  const freelancerFee = rawFee && String(rawFee).trim() !== "" ? Number(rawFee) : null;
  if (!projectId || !crewMemberId) return;
  const admin = createAdminClient();
  if (!admin) return;
  const { data: existing } = await admin
    .from("crew_assignments")
    .select("id")
    .match({ project_id: projectId, crew_member_id: crewMemberId })
    .maybeSingle();
  if (!existing) {
    await admin.from("crew_assignments").insert({
      project_id: projectId,
      crew_member_id: crewMemberId,
      assignment_role: assignmentRole,
      participant_type: participantType,
      freelancer_fee: freelancerFee,
    });
  }
  revalidatePath(`/admin/projects/${projectId}`);
}

export async function removeCrewFromProjectAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const projectId = String(formData.get("projectId") || "").trim();
  const assignmentId = String(formData.get("assignmentId") || "").trim();
  if (!projectId || !assignmentId) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("crew_assignments").delete().eq("id", assignmentId);
  revalidatePath(`/admin/projects/${projectId}`);
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

  // Also add to contacts list (skip if email already exists)
  if (email) {
    const { data: existing } = await admin
      .from("contacts")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (!existing) {
      await admin.from("contacts").insert({
        full_name: fullName,
        email,
        phone,
        status: "confirmed",
        converted_client_id: client.id,
      });
    }
  } else {
    await admin.from("contacts").insert({
      full_name: fullName,
      email: null,
      phone,
      status: "confirmed",
      converted_client_id: client.id,
    });
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
  revalidatePath("/admin/contacts");
}