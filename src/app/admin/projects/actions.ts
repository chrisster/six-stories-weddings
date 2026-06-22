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

  // Services + event type → project_type string
  const servicesRaw = String(formData.get("services") || "");
  const servicesArr = servicesRaw.split(",").filter(Boolean);
  const rawEventType = String(formData.get("eventType") || "wedding").trim().toLowerCase();
  const eventLabel = rawEventType === "baptism" ? "Baptism" : "Wedding";
  const servicesLabel =
    servicesArr.includes("photo") && servicesArr.includes("video")
      ? "Photo + Video"
      : servicesArr.includes("photo")
        ? "Photography"
        : servicesArr.includes("video")
          ? "Videography"
          : null;
  const projectType = servicesLabel ? `${eventLabel} ${servicesLabel}` : eventLabel;

  // Always create as draft initially
  const status = "draft";
  const editingStatus = "not_started";
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
  // Accept DD-MM-YYYY (display format) and convert to YYYY-MM-DD for storage
  const rawDate = String(formData.get("eventDate") || "").trim();
  const eventDate = /^\d{2}-\d{2}-\d{4}$/.test(rawDate)
    ? `${rawDate.slice(6)}-${rawDate.slice(3, 5)}-${rawDate.slice(0, 2)}`
    : rawDate;
  const projectType = String(formData.get("projectType") || "Wedding").trim();
  const status = String(formData.get("status") || "draft").trim();
  const editingStatus = String(formData.get("editingStatus") || "not_started").trim();
  const referral = String(formData.get("referral") || "").trim() || null;
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
      referral,
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