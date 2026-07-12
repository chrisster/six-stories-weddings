"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { hasSupabaseEnv } from "@/lib/env";
import { getCurrentUser, getCurrentUserRole } from "@/lib/auth";
import { notifyCrewMemberById } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

function toNumber(value: FormDataEntryValue | null) {
  const parsed = Number(String(value || "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePayments(formData: FormData): Array<{ date: string; amount: number; note?: string }> {
  const dates = formData.getAll("paymentDate").map((value) => String(value || "").trim());
  const amounts = formData.getAll("paymentAmount").map((value) => Number(String(value || "0")));
  const notes = formData.getAll("paymentNote").map((value) => String(value || "").trim());

  const maxLen = Math.max(dates.length, amounts.length, notes.length);
  const payments: Array<{ date: string; amount: number; note?: string }> = [];

  for (let index = 0; index < maxLen; index += 1) {
    const rawDate = dates[index] || "";
    const date = normalizeEventDate(rawDate);
    const amount = amounts[index];
    const note = notes[index] || "";

    if (!rawDate && (!Number.isFinite(amount) || amount <= 0) && !note) {
      continue;
    }

    if (!date || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    payments.push({
      date,
      amount,
      note: note || undefined,
    });
  }

  return payments;
}

function parseTimeplan(
  formData: FormData,
): Array<{ time: string; action: string; location: string | null; notes: string | null }> {
  const times = formData.getAll("timeplanTime").map((value) => String(value || "").trim());
  const actions = formData.getAll("timeplanAction").map((value) => String(value || "").trim());
  const locations = formData.getAll("timeplanLocation").map((value) => String(value || "").trim());
  const notes = formData.getAll("timeplanNotes").map((value) => String(value || "").trim());

  const maxLen = Math.max(times.length, actions.length, locations.length, notes.length);
  const items: Array<{ time: string; action: string; location: string | null; notes: string | null }> = [];

  for (let index = 0; index < maxLen; index += 1) {
    const time = times[index] || "";
    const action = actions[index] || "";
    const location = locations[index] || "";
    const note = notes[index] || "";

    if (!time && !action && !location && !note) {
      continue;
    }

    items.push({
      time,
      action,
      location: location || null,
      notes: note || null,
    });
  }

  return items;
}

function stripMissingOptionalColumns(
  payload: Record<string, unknown>,
  message: string,
): Record<string, unknown> {
  const lower = message.toLowerCase();
  const next = { ...payload };
  let changed = false;

  ["referral", "offer_amount", "payments_json", "timeplan_json"].forEach((column) => {
    if (lower.includes(column) && column in next) {
      delete next[column];
      changed = true;
    }
  });

  return changed ? next : payload;
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

  if ((await getCurrentUserRole()) === "crew") {
    redirect("/admin");
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
  const offerAmount = toNumber(formData.get("offerAmount")) || toNumber(formData.get("budgetTotal"));
  const payments = parsePayments(formData);
  const amountPaidInput = toNumber(formData.get("amountPaid"));
  const paymentsTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const amountPaid = payments.length > 0 ? paymentsTotal : amountPaidInput;
  const budgetTotal = offerAmount;
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

  let insertPayload: Record<string, unknown> = {
    title,
    event_date: eventDate,
    month: eventDate.slice(0, 7),
    project_type: projectType,
    status,
    offer_amount: offerAmount,
    budget_total: budgetTotal,
    amount_paid: amountPaid,
    amount_remaining: amountRemaining,
    payments_json: payments,
    notes,
  };

  let project: { id: string; title: string } | null = null;
  let projectError: { message: string } | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await admin
      .from("projects")
      .insert(insertPayload)
      .select("id, title")
      .single();

    project = (result.data as { id: string; title: string } | null) || null;
    projectError = result.error ? { message: result.error.message } : null;

    if (!projectError && project) {
      break;
    }

    const nextPayload = stripMissingOptionalColumns(insertPayload, projectError?.message || "");
    if (Object.keys(nextPayload).length === Object.keys(insertPayload).length) {
      break;
    }
    insertPayload = nextPayload;
  }

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
  if ((await getCurrentUserRole()) === "crew") return;

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

  if ((await getCurrentUserRole()) === "crew") {
    redirect(`/admin/projects/${projectId}`);
  }

  const rawDate = String(formData.get("eventDate") || "").trim();
  const eventDate = normalizeEventDate(rawDate);
  if (!eventDate) {
    redirect(`/admin/projects/${projectId}?save=error&reason=date`);
  }

  const result = await persistProjectFromForm(formData);

  if (!result.ok) {
    redirect(
      `/admin/projects/${projectId}?save=error&reason=server&detail=${encodeURIComponent(result.detail || "")}`,
    );
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
  revalidatePath("/admin");
  redirect(`/admin/projects/${projectId}?save=ok`);
}

export async function autosaveProjectAction(
  formData: FormData,
): Promise<{ ok: boolean; reason?: string; detail?: string }> {
  if (!hasSupabaseEnv) {
    return { ok: false, reason: "demo" };
  }

  const projectId = String(formData.get("projectId") || "").trim();
  if (!projectId) {
    return { ok: false, reason: "missing_project" };
  }

  if ((await getCurrentUserRole()) === "crew") {
    return { ok: false, reason: "forbidden" };
  }

  const rawDate = String(formData.get("eventDate") || "").trim();
  const eventDate = normalizeEventDate(rawDate);
  if (!eventDate) {
    return { ok: false, reason: "date" };
  }

  const result = await persistProjectFromForm(formData);
  if (!result.ok) {
    return { ok: false, reason: "server", detail: result.detail };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
  revalidatePath("/admin");
  return { ok: true };
}

async function persistProjectFromForm(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; detail?: string }> {
  const projectId = String(formData.get("projectId") || "").trim();
  if (!projectId) {
    return { ok: false, detail: "Missing project id" };
  }

  const title = String(formData.get("title") || "").trim();
  const rawDate = String(formData.get("eventDate") || "").trim();
  const eventDate = normalizeEventDate(rawDate);
  if (!eventDate) {
    return { ok: false, detail: "Invalid date" };
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
  const offerAmount = toNumber(formData.get("offerAmount")) || toNumber(formData.get("budgetTotal"));
  const payments = parsePayments(formData);
  const timeplan = parseTimeplan(formData);
  const amountPaidInput = toNumber(formData.get("amountPaid"));
  const paymentsTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const amountPaid = payments.length > 0 ? paymentsTotal : amountPaidInput;
  const budgetTotal = offerAmount;
  const amountRemaining = Math.max(0, budgetTotal - amountPaid);

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, detail: "No admin client" };
  }

  const payload: Record<string, unknown> = {
    title,
    event_date: eventDate,
    month: eventDate ? eventDate.slice(0, 7) : null,
    project_type: projectType,
    status,
    referral,
    offer_amount: offerAmount,
    budget_total: budgetTotal,
    amount_paid: amountPaid,
    amount_remaining: amountRemaining,
    payments_json: payments,
    timeplan_json: timeplan,
    notes,
  };

  // Crew members must not be able to change financial fields.
  const role = await getCurrentUserRole();
  if (role === "crew") {
    delete payload.offer_amount;
    delete payload.budget_total;
    delete payload.amount_paid;
    delete payload.amount_remaining;
    delete payload.payments_json;
  }

  let updatePayload = { ...payload };
  let error: { message: string } | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await admin
      .from("projects")
      .update(updatePayload)
      .eq("id", projectId);

    error = result.error ? { message: result.error.message } : null;
    if (!error) {
      break;
    }

    const nextPayload = stripMissingOptionalColumns(updatePayload, error.message);
    if (Object.keys(nextPayload).length === Object.keys(updatePayload).length) {
      break;
    }
    updatePayload = nextPayload;
  }

  if (error) {
    console.error("persistProjectFromForm failed", {
      projectId,
      message: error.message,
      status,
      eventDate,
      projectType,
    });
    return { ok: false, detail: error.message };
  }

  return { ok: true };
}

export async function shareTimeplanAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "").trim();
  const audience = String(formData.get("audience") || "").trim() === "crew" ? "crew" : "client";

  if (!hasSupabaseEnv || !projectId) {
    redirect(`/admin/projects/${projectId}?share=error&reason=unavailable`);
  }

  const { getProjectById, getCrewMembers } = await import("@/lib/data");
  const { buildTimeplanEmail } = await import("@/lib/timeplan-notifications");
  const { sendGalleryNotificationEmail } = await import("@/lib/gallery-notifications");

  const project = await getProjectById(projectId);
  if (!project) {
    redirect(`/admin/projects/${projectId}?share=error&reason=not_found`);
  }

  if (!project.timeplan || project.timeplan.length === 0) {
    redirect(`/admin/projects/${projectId}?share=error&reason=empty`);
  }

  const recipients: Array<{ email: string; name: string }> = [];

  if (audience === "client") {
    project.clients.forEach((client) => {
      const email = (client.email || "").trim();
      if (email) {
        recipients.push({ email, name: client.fullName });
      }
    });
  } else {
    const assignedIds = new Set(project.crewAssignments.map((assignment) => assignment.crewMemberId));
    const crewMembers = await getCrewMembers();
    const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/;

    project.crewAssignments.forEach((assignment) => {
      const contact = (assignment.crewMember.contactInfo || "").trim();
      const match = contact.match(emailPattern);
      if (match) {
        recipients.push({ email: match[0], name: assignment.crewMember.fullName });
      }
    });

    crewMembers.forEach((member) => {
      if (!assignedIds.has(member.id)) return;
      const contact = (member.contactInfo || "").trim();
      const match = contact.match(emailPattern);
      if (match && !recipients.some((recipient) => recipient.email === match[0])) {
        recipients.push({ email: match[0], name: member.fullName });
      }
    });
  }

  const uniqueRecipients = Array.from(
    new Map(recipients.map((recipient) => [recipient.email.toLowerCase(), recipient])).values(),
  );

  if (uniqueRecipients.length === 0) {
    redirect(`/admin/projects/${projectId}?share=error&reason=no_recipients`);
  }

  let sentCount = 0;
  for (const recipient of uniqueRecipients) {
    const email = buildTimeplanEmail({
      audience,
      projectTitle: project.title,
      eventDate: project.eventDate,
      items: project.timeplan,
      recipientName: recipient.name,
    });

    try {
      const result = await sendGalleryNotificationEmail({
        to: recipient.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (result.sent) {
        sentCount += 1;
      }
    } catch (sendError) {
      console.error("shareTimeplanAction send failed", { projectId, email: recipient.email, sendError });
    }
  }

  if (sentCount === 0) {
    redirect(`/admin/projects/${projectId}?share=error&reason=send_failed`);
  }

  redirect(`/admin/projects/${projectId}?share=ok&audience=${audience}&count=${sentCount}`);
}

export async function updateClientAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  if ((await getCurrentUserRole()) === "crew") {
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
  if ((await getCurrentUserRole()) === "crew") return;
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
  if ((await getCurrentUserRole()) === "crew") return;
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

    const { data: project } = await admin
      .from("projects")
      .select("title")
      .eq("id", projectId)
      .maybeSingle();
    const actor = await getCurrentUser();
    await notifyCrewMemberById(
      crewMemberId,
      {
        type: "project_assigned",
        title: "You were added to a project",
        body: `${String(project?.title || "A project")} — role: ${assignmentRole}`,
        link: `/admin/projects/${projectId}`,
      },
      actor?.email,
    );
  }

  revalidatePath(`/admin/projects/${projectId}`);
}

export async function removeCrewFromProjectAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  if ((await getCurrentUserRole()) === "crew") return;
  const projectId = String(formData.get("projectId") || "").trim();
  const assignmentId = String(formData.get("assignmentId") || "").trim();
  if (!projectId || !assignmentId) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("crew_assignments").delete().eq("id", assignmentId);
  revalidatePath(`/admin/projects/${projectId}`);
}

export async function updateCrewAssignmentAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  if ((await getCurrentUserRole()) === "crew") return;
  const projectId = String(formData.get("projectId") || "").trim();
  const assignmentId = String(formData.get("assignmentId") || "").trim();
  const assignmentRole = String(formData.get("assignmentRole") || "").trim();
  const participantType = String(formData.get("participantType") || "inhouse").trim() === "freelancer"
    ? "freelancer"
    : "inhouse";
  const rawFee = formData.get("freelancerFee");
  const freelancerFee =
    participantType === "freelancer" && rawFee && String(rawFee).trim() !== ""
      ? Number(rawFee)
      : null;

  if (!projectId || !assignmentId) return;

  const admin = createAdminClient();
  if (!admin) return;

  await admin
    .from("crew_assignments")
    .update({
      assignment_role: assignmentRole || "crew",
      participant_type: participantType,
      freelancer_fee: freelancerFee,
    })
    .eq("id", assignmentId);

  revalidatePath(`/admin/projects/${projectId}`);
}

export async function addClientToProjectAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  if ((await getCurrentUserRole()) === "crew") {
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

export async function setClientPortalPasswordAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const projectId = String(formData.get("projectId") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim() || null;
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("portalPassword") || "");

  if (!projectId || !email || password.length < 8) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { error } = await admin.from("client_portal_accounts").upsert(
    {
      email,
      full_name: fullName,
      password_hash: passwordHash,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "email" },
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/portal");
}