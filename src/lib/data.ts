import { addDays, isAfter, parseISO } from "date-fns";

import {
  demoContacts,
  demoCrewMembersList,
  demoGallery,
  demoGalleryDetail,
  demoProject,
} from "@/lib/demo-data";
import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Contact, CrewMember, Gallery, GalleryDetail, Project } from "@/lib/types";

type DashboardMetrics = {
  totalProjects: number;
  confirmedProjects: number;
  unconfirmedProjects: number;
  upcomingProjects: number;
  totalBudget: number;
  totalPaid: number;
  totalRemaining: number;
};

function normalizeProject(row: Record<string, unknown>): Project {
  const clients = ((row.clients as Record<string, unknown>[] | null) || []).map((c) => ({
    id: String(c.id),
    fullName: String(c.full_name || ""),
    email: c.email as string | null,
    phone: c.phone as string | null,
    notes: c.notes as string | null,
  }));

  const crewAssignments =
    ((row.crew_assignments as Record<string, unknown>[] | null) || []).map((assignment) => {
      const member = (assignment.crew_member as Record<string, unknown>) || {};
      return {
        id: String(assignment.id),
        projectId: String(assignment.project_id),
        crewMemberId: String(assignment.crew_member_id),
        assignmentRole: String(assignment.assignment_role || ""),
        notes: assignment.notes as string | null,
        crewMember: {
          id: String(member.id || ""),
          fullName: String(member.full_name || ""),
          roleType: (member.role_type as "photographer" | "videographer" | "editor" | "assistant") || "assistant",
          contactInfo: member.contact_info as string | null,
        },
      };
    });

  const tasks = ((row.project_tasks as Record<string, unknown>[] | null) || []).map((task) => ({
    id: String(task.id),
    projectId: String(task.project_id),
    title: String(task.title || ""),
    status: (task.status as "todo" | "in_progress" | "done") || "todo",
    dueDate: task.due_date as string | null,
    priority: (task.priority as "low" | "medium" | "high") || "medium",
  }));

  const deliverables =
    ((row.deliverables as Record<string, unknown>[] | null) || []).map((deliverable) => ({
      id: String(deliverable.id),
      projectId: String(deliverable.project_id),
      deliverableType:
        (deliverable.deliverable_type as "photos" | "highlight_film" | "teaser" | "reel") ||
        "photos",
      status: (deliverable.status as "pending" | "in_progress" | "delivered") || "pending",
      dueDate: deliverable.due_date as string | null,
      deliveredAt: deliverable.delivered_at as string | null,
      notes: deliverable.notes as string | null,
    }));

  return {
    id: String(row.id),
    title: String(row.title || ""),
    eventDate: String(row.event_date || ""),
    month: String(row.month || ""),
    projectType: String(row.project_type || ""),
    referral: row.referral as string | null,
    packageCategory: row.package_category as string | null,
    status: (row.status as "confirmed" | "unconfirmed" | "cancelled") || "unconfirmed",
    editingStatus:
      (row.editing_status as "not_started" | "in_progress" | "review" | "completed") ||
      "not_started",
    completed: Boolean(row.completed),
    budgetTotal: Number(row.budget_total || 0),
    amountPaid: Number(row.amount_paid || 0),
    amountRemaining: Number(row.amount_remaining || 0),
    notes: row.notes as string | null,
    clients,
    crewAssignments,
    tasks,
    deliverables,
  };
}

export async function getProjects() {
  if (!hasSupabaseEnv) {
    return [demoProject];
  }

  const admin = createAdminClient();
  if (!admin) {
    return [demoProject];
  }

  const { data, error } = await admin
    .from("projects")
    .select(
      `
      *,
      clients:project_clients(client:clients(*)),
      crew_assignments(*, crew_member:crew_members(*)),
      project_tasks(*),
      deliverables(*)
    `,
    )
    .order("event_date", { ascending: true });

  if (error || !data) {
    return [demoProject];
  }

  return data.map((row) => {
    const normalized = {
      ...row,
      clients: ((row.clients as { client: Record<string, unknown> }[]) || []).map((c) => c.client),
    };

    return normalizeProject(normalized as unknown as Record<string, unknown>);
  });
}

export async function getProjectById(projectId: string) {
  const projects = await getProjects();
  return projects.find((project) => project.id === projectId) || null;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const projects = await getProjects();
  const cutoff = addDays(new Date(), -1);

  return {
    totalProjects: projects.length,
    confirmedProjects: projects.filter((project) => project.status === "confirmed").length,
    unconfirmedProjects: projects.filter((project) => project.status === "unconfirmed").length,
    upcomingProjects: projects.filter((project) => isAfter(parseISO(project.eventDate), cutoff)).length,
    totalBudget: projects.reduce((total, project) => total + project.budgetTotal, 0),
    totalPaid: projects.reduce((total, project) => total + project.amountPaid, 0),
    totalRemaining: projects.reduce((total, project) => total + project.amountRemaining, 0),
  };
}

export async function getGalleries() {
  if (!hasSupabaseEnv) {
    return [demoGallery];
  }

  const admin = createAdminClient();
  if (!admin) {
    return [demoGallery];
  }

  const { data, error } = await admin.from("galleries").select("*").order("created_at", { ascending: false });
  if (error || !data) {
    return [demoGallery];
  }

  return data.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    slug: String(row.slug),
    title: String(row.title),
    isPublished: Boolean(row.is_published),
    allowDownloads: Boolean(row.allow_downloads),
    hasPasscode: Boolean(row.passcode_hash),
    passcodeHash: row.passcode_hash as string | null,
    coverMediaId: row.cover_media_id as string | null,
  })) as Gallery[];
}

export async function getGalleryById(galleryId: string): Promise<GalleryDetail | null> {
  if (!hasSupabaseEnv) {
    if (demoGalleryDetail.gallery.id !== galleryId) {
      return null;
    }

    return demoGalleryDetail;
  }

  const admin = createAdminClient();
  if (!admin) {
    return demoGalleryDetail;
  }

  const { data: galleryRow } = await admin.from("galleries").select("*").eq("id", galleryId).single();
  if (!galleryRow) {
    return null;
  }

  const [project, sections, media] = await Promise.all([
    getProjectById(String(galleryRow.project_id)),
    admin
      .from("gallery_sections")
      .select("*")
      .eq("gallery_id", galleryId)
      .order("sort_order", { ascending: true }),
    admin
      .from("media_assets")
      .select("*")
      .eq("gallery_id", galleryId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!project) {
    return null;
  }

  return {
    gallery: {
      id: String(galleryRow.id),
      projectId: String(galleryRow.project_id),
      slug: String(galleryRow.slug),
      title: String(galleryRow.title),
      isPublished: Boolean(galleryRow.is_published),
      allowDownloads: Boolean(galleryRow.allow_downloads),
      hasPasscode: Boolean(galleryRow.passcode_hash),
      passcodeHash: galleryRow.passcode_hash as string | null,
      coverMediaId: galleryRow.cover_media_id as string | null,
    },
    project,
    sections: (sections.data || []).map((row) => ({
      id: String(row.id),
      galleryId: String(row.gallery_id),
      name: String(row.name),
      sortOrder: Number(row.sort_order),
    })),
    mediaAssets: (media.data || []).map((row) => ({
      id: String(row.id),
      galleryId: String(row.gallery_id),
      sectionId: (row.section_id as string | null) || null,
      storagePath: String(row.storage_path),
      mediaType: (row.media_type as "photo" | "video") || "photo",
      sortOrder: Number(row.sort_order || 0),
      isCover: Boolean(row.is_cover),
    })),
  };
}

export async function getPublicGalleryBySlug(slug: string) {
  if (!hasSupabaseEnv) {
    if (demoGallery.slug !== slug || !demoGallery.isPublished) {
      return null;
    }

    return demoGalleryDetail;
  }

  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data: galleryRow } = await admin
    .from("galleries")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (!galleryRow) {
    return null;
  }

  return getGalleryById(String(galleryRow.id));
}

export async function getCrewMembers(): Promise<CrewMember[]> {
  if (!hasSupabaseEnv) {
    return demoCrewMembersList;
  }

  const admin = createAdminClient();
  if (!admin) {
    return demoCrewMembersList;
  }

  const { data, error } = await admin
    .from("crew_members")
    .select("*")
    .eq("active", true)
    .order("full_name", { ascending: true });

  if (error || !data) {
    return demoCrewMembersList;
  }

  return data.map((row) => ({
    id: String(row.id),
    fullName: String(row.full_name || ""),
    roleType: (row.role_type as CrewMember["roleType"]) || "assistant",
    contactInfo: (row.contact_info as string | null) || null,
  }));
}

export async function getContacts(): Promise<Contact[]> {
  if (!hasSupabaseEnv) {
    return demoContacts;
  }

  const admin = createAdminClient();
  if (!admin) {
    return demoContacts;
  }

  const { data, error } = await admin.from("contacts").select("*").order("created_at", { ascending: false });
  if (error || !data) {
    return demoContacts;
  }

  return data.map((row) => ({
    id: String(row.id),
    fullName: String(row.full_name || ""),
    email: (row.email as string | null) || null,
    phone: (row.phone as string | null) || null,
    eventDate: (row.event_date as string | null) || null,
    offerAmount: row.offer_amount != null ? Number(row.offer_amount) : null,
    status: (row.status as Contact["status"]) || "lead",
    notes: (row.notes as string | null) || null,
    convertedClientId: (row.converted_client_id as string | null) || null,
    createdAt: String(row.created_at || ""),
  }));
}