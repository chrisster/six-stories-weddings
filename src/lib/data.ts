import { randomBytes } from "node:crypto";

import {
  demoContacts,
  demoCrewMembersList,
  demoGallery,
  demoGalleryDetail,
  demoProject,
} from "@/lib/demo-data";
import { hasSupabaseEnv } from "@/lib/env";
import { buildDefaultGalleryNotificationTemplate } from "@/lib/gallery-notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedMediaUrl } from "@/lib/storage";
import type {
  ClientPortalAccountSummary,
  Contact,
  CrewMember,
  Gallery,
  GalleryDetail,
  GuestGalleryLink,
  GalleryNotificationTemplate,
  PortalGallery,
  Project,
} from "@/lib/types";

function normalizePaymentDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    return `${trimmed.slice(6)}-${trimmed.slice(3, 5)}-${trimmed.slice(0, 2)}`;
  }
  return "";
}

function normalizePayments(raw: unknown): Array<{ date: string; amount: number; note?: string }> {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.reduce<Array<{ date: string; amount: number; note?: string }>>((acc, entry) => {
    if (!entry || typeof entry !== "object") {
      return acc;
    }

    const candidate = entry as Record<string, unknown>;
    const date = normalizePaymentDate(String(candidate.date || ""));
    const amount = Number(candidate.amount || 0);
    const note = String(candidate.note || "").trim();
    if (!date || !Number.isFinite(amount) || amount <= 0) {
      return acc;
    }

    acc.push({
      date,
      amount,
      note: note || undefined,
    });
    return acc;
  }, []);
}

function normalizeTimeplan(
  raw: unknown,
): Array<{ time: string; action: string; location: string | null; notes: string | null }> {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.reduce<Array<{ time: string; action: string; location: string | null; notes: string | null }>>(
    (acc, entry) => {
      if (!entry || typeof entry !== "object") {
        return acc;
      }

      const candidate = entry as Record<string, unknown>;
      const time = String(candidate.time || "").trim();
      const action = String(candidate.action || "").trim();
      const location = String(candidate.location || "").trim();
      const notes = String(candidate.notes || "").trim();

      if (!time && !action && !location && !notes) {
        return acc;
      }

      acc.push({
        time,
        action,
        location: location || null,
        notes: notes || null,
      });
      return acc;
    },
    [],
  );
}

type DashboardMetrics = {
  totalProjects: number;
  draftProjects: number;
  negotiatingProjects: number;
  scheduledProjects: number;
  postProductionProjects: number;
  completedProjects: number;
  cancelledProjects: number;
  declinedProjects: number;
  totalBudget: number;
  totalPaid: number;
  totalRemaining: number;
};

function normalizeProject(row: Record<string, unknown>, coverImageUrl?: string | null): Project {
  const rawStatus = String(row.status || "draft").trim();
  const mappedStatus =
    rawStatus === "confirmed"
      ? "scheduled"
      : rawStatus === "unconfirmed"
        ? "draft"
        : rawStatus;

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
        participantType: ((assignment.participant_type as string) === "freelancer" ? "freelancer" : "inhouse") as "inhouse" | "freelancer",
        freelancerFee: assignment.freelancer_fee != null ? Number(assignment.freelancer_fee) : null,
        notes: assignment.notes as string | null,
        crewMember: {
          id: String(member.id || ""),
          fullName: String(member.full_name || ""),
          roleType: (member.role_type as "photographer" | "videographer" | "editor" | "assistant" | "partner") || "assistant",
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
    assigneeId: task.assignee_id as string | null,
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

  const offerAmount = Number((row.offer_amount ?? row.budget_total) || 0);
  const payments = normalizePayments(row.payments_json);
  const timeplan = normalizeTimeplan(row.timeplan_json);
  const paymentsTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const amountPaid = Number((row.amount_paid ?? paymentsTotal) || 0);
  const amountRemaining = Math.max(0, Number(row.amount_remaining ?? offerAmount - amountPaid));

  return {
    id: String(row.id),
    title: String(row.title || ""),
    eventDate: String(row.event_date || ""),
    month: String(row.month || ""),
    projectType: String(row.project_type || ""),
    referral: row.referral as string | null,
    packageCategory: row.package_category as string | null,
    status:
      (mappedStatus as
        | "draft"
        | "negotiating"
        | "scheduled"
        | "post_production"
        | "completed"
        | "cancelled"
        | "declined") || "draft",
    completed: Boolean(row.completed),
      offerAmount,
      budgetTotal: offerAmount,
      amountPaid,
      amountRemaining,
      payments,
      timeplan,
    notes: row.notes as string | null,
    coverImageUrl: coverImageUrl || null,
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

  const projectIds = data.map((row) => String(row.id));

  const { data: galleries } = await admin
    .from("galleries")
    .select("id, project_id, cover_media_id")
    .in("project_id", projectIds);

  const galleryByProjectId = new Map<string, { id: string; coverMediaId?: string | null }>();
  (galleries || []).forEach((row) => {
    galleryByProjectId.set(String(row.project_id), {
      id: String(row.id),
      coverMediaId: (row.cover_media_id as string | null) || null,
    });
  });

  const galleryIds = (galleries || []).map((row) => String(row.id));
  const mediaByGalleryId = new Map<string, Array<{ id: string; storagePath: string; sortOrder: number }>>();

  if (galleryIds.length > 0) {
    const { data: media } = await admin
      .from("media_assets")
      .select("id, gallery_id, storage_path, sort_order")
      .in("gallery_id", galleryIds)
      .order("sort_order", { ascending: true });

    (media || []).forEach((row) => {
      const key = String(row.gallery_id);
      const current = mediaByGalleryId.get(key) || [];
      current.push({
        id: String(row.id),
        storagePath: String(row.storage_path),
        sortOrder: Number(row.sort_order || 0),
      });
      mediaByGalleryId.set(key, current);
    });
  }

  const projectsWithCovers = await Promise.all(
    data.map(async (row) => {
      const normalized = {
        ...row,
        clients: ((row.clients as { client: Record<string, unknown> }[]) || []).map((c) => c.client),
      };

      const gallery = galleryByProjectId.get(String(row.id));
      const galleryMedia = gallery ? mediaByGalleryId.get(gallery.id) || [] : [];

      const preferred =
        (gallery?.coverMediaId
          ? galleryMedia.find((asset) => asset.id === gallery.coverMediaId)
          : null) || galleryMedia[0] || null;

      let coverImageUrl: string | null = null;
      if (preferred) {
        try {
          coverImageUrl = await getSignedMediaUrl(preferred.storagePath, 60 * 60 * 24 * 7);
        } catch {
          coverImageUrl = preferred.storagePath;
        }
      }

      return normalizeProject(normalized as unknown as Record<string, unknown>, coverImageUrl);
    }),
  );

  return projectsWithCovers;
}

export async function getProjectById(projectId: string) {
  const projects = await getProjects();
  return projects.find((project) => project.id === projectId) || null;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const projects = await getProjects();

  return {
    totalProjects: projects.length,
    draftProjects: projects.filter((project) => project.status === "draft").length,
    negotiatingProjects: projects.filter((project) => project.status === "negotiating").length,
    scheduledProjects: projects.filter((project) => project.status === "scheduled").length,
    postProductionProjects: projects.filter((project) => project.status === "post_production").length,
    completedProjects: projects.filter((project) => project.status === "completed").length,
    cancelledProjects: projects.filter((project) => project.status === "cancelled").length,
    declinedProjects: projects.filter((project) => project.status === "declined").length,
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
      originalName: (row.original_name as string | null) || null,
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

export async function getGalleryFavorites(
  galleryId: string,
): Promise<{ counts: Record<string, number>; total: number; guests: number }> {
  if (!hasSupabaseEnv) {
    return { counts: {}, total: 0, guests: 0 };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { counts: {}, total: 0, guests: 0 };
  }

  const { data } = await admin
    .from("gallery_favorites")
    .select("media_asset_id, guest_session_id")
    .eq("gallery_id", galleryId);

  const counts: Record<string, number> = {};
  const guests = new Set<string>();
  (data || []).forEach((row) => {
    const id = String(row.media_asset_id);
    counts[id] = (counts[id] || 0) + 1;
    guests.add(String(row.guest_session_id));
  });

  return { counts, total: (data || []).length, guests: guests.size };
}

export type OrganizationSettings = {
  studioName: string;
  contactEmail: string;
  replyToEmail: string;
  phone: string;
  website: string;
  address: string;
};

export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  const empty: OrganizationSettings = {
    studioName: "",
    contactEmail: "",
    replyToEmail: "",
    phone: "",
    website: "",
    address: "",
  };

  if (!hasSupabaseEnv) {
    return empty;
  }

  const admin = createAdminClient();
  if (!admin) {
    return empty;
  }

  const { data } = await admin
    .from("organization_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (!data) {
    return empty;
  }

  return {
    studioName: String(data.studio_name || ""),
    contactEmail: String(data.contact_email || ""),
    replyToEmail: String(data.reply_to_email || ""),
    phone: String(data.phone || ""),
    website: String(data.website || ""),
    address: String(data.address || ""),
  };
}

export async function getAssignedProjectIdsForEmail(email: string): Promise<string[]> {
  const normalized = (email || "").trim().toLowerCase();
  if (!hasSupabaseEnv || !normalized) {
    return [];
  }

  const admin = createAdminClient();
  if (!admin) {
    return [];
  }

  const { data: members } = await admin
    .from("crew_members")
    .select("id, email, contact_info")
    .or(`email.eq.${normalized},contact_info.eq.${normalized}`);

  const memberIds = (members || []).map((row) => String(row.id));
  if (memberIds.length === 0) {
    return [];
  }

  const { data: assignments } = await admin
    .from("crew_assignments")
    .select("project_id")
    .in("crew_member_id", memberIds);

  return Array.from(new Set((assignments || []).map((row) => String(row.project_id))));
}

export async function logGalleryEvent(
  galleryId: string,
  eventType: "view" | "download",
  options?: { mediaAssetId?: string | null; session?: string | null },
): Promise<void> {
  if (!hasSupabaseEnv || !galleryId) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  await admin.from("gallery_events").insert({
    gallery_id: galleryId,
    event_type: eventType,
    media_asset_id: options?.mediaAssetId || null,
    guest_session_id: options?.session || null,
  });
}

export async function getGalleryEventStats(
  galleryIds?: string[],
  since?: Date | null,
): Promise<{
  totals: { views: number; viewers: number; downloads: number; galleriesWithDownloads: number };
  byGallery: Record<string, { views: number; downloads: number; viewers: number }>;
}> {
  const empty = {
    totals: { views: 0, viewers: 0, downloads: 0, galleriesWithDownloads: 0 },
    byGallery: {} as Record<string, { views: number; downloads: number; viewers: number }>,
  };

  if (!hasSupabaseEnv) {
    return empty;
  }

  const admin = createAdminClient();
  if (!admin) {
    return empty;
  }

  let query = admin.from("gallery_events").select("gallery_id, event_type, guest_session_id");
  if (galleryIds && galleryIds.length > 0) {
    query = query.in("gallery_id", galleryIds);
  }
  if (since) {
    query = query.gte("created_at", since.toISOString());
  }

  const { data } = await query;
  const rows = data || [];

  const byGallery: Record<string, { views: number; downloads: number; viewers: Set<string> }> = {};
  const globalViewers = new Set<string>();
  const downloadGalleries = new Set<string>();
  let views = 0;
  let downloads = 0;

  rows.forEach((row) => {
    const galleryId = String(row.gallery_id);
    if (!byGallery[galleryId]) {
      byGallery[galleryId] = { views: 0, downloads: 0, viewers: new Set() };
    }
    if (row.event_type === "view") {
      views += 1;
      byGallery[galleryId].views += 1;
      const session = row.guest_session_id ? String(row.guest_session_id) : "";
      if (session) {
        byGallery[galleryId].viewers.add(session);
        globalViewers.add(session);
      }
    } else if (row.event_type === "download") {
      downloads += 1;
      byGallery[galleryId].downloads += 1;
      downloadGalleries.add(galleryId);
    }
  });

  const normalizedByGallery: Record<string, { views: number; downloads: number; viewers: number }> = {};
  Object.entries(byGallery).forEach(([id, value]) => {
    normalizedByGallery[id] = {
      views: value.views,
      downloads: value.downloads,
      viewers: value.viewers.size,
    };
  });

  return {
    totals: {
      views,
      viewers: globalViewers.size,
      downloads,
      galleriesWithDownloads: downloadGalleries.size,
    },
    byGallery: normalizedByGallery,
  };
}

export async function getGalleryCommentCounts(
  galleryId: string,
): Promise<Record<string, number>> {
  if (!hasSupabaseEnv) {
    return {};
  }

  const admin = createAdminClient();
  if (!admin) {
    return {};
  }

  const { data } = await admin
    .from("gallery_comments")
    .select("media_asset_id")
    .eq("gallery_id", galleryId);

  const counts: Record<string, number> = {};
  (data || []).forEach((row) => {
    if (!row.media_asset_id) return;
    const id = String(row.media_asset_id);
    counts[id] = (counts[id] || 0) + 1;
  });

  return counts;
}

export async function getClientPortalAccountsByEmails(
  emails: string[],
): Promise<Record<string, ClientPortalAccountSummary>> {
  const normalized = Array.from(
    new Set(
      emails
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (!hasSupabaseEnv || normalized.length === 0) {
    return {};
  }

  const admin = createAdminClient();
  if (!admin) {
    return {};
  }

  const { data } = await admin
    .from("client_portal_accounts")
    .select("id, email, password_hash, is_active, last_notified_at")
    .in("email", normalized);

  const map: Record<string, ClientPortalAccountSummary> = {};
  (data || []).forEach((row) => {
    const email = String(row.email || "").toLowerCase();
    if (!email) return;
    map[email] = {
      id: String(row.id),
      email,
      hasPassword: Boolean(row.password_hash),
      isActive: Boolean(row.is_active),
      lastNotifiedAt: (row.last_notified_at as string | null) || null,
    };
  });

  return map;
}

export async function getGalleryNotificationTemplate(
  galleryId: string,
  fallback: { projectTitle: string; galleryTitle: string; heroImageUrl?: string | null },
): Promise<GalleryNotificationTemplate> {
  const defaults = buildDefaultGalleryNotificationTemplate(fallback);
  if (!hasSupabaseEnv) {
    return defaults;
  }

  const admin = createAdminClient();
  if (!admin) {
    return defaults;
  }

  const { data } = await admin
    .from("gallery_notification_templates")
    .select("email_subject, email_headline, email_intro, email_body, button_label, share_note, hero_image_url")
    .eq("gallery_id", galleryId)
    .maybeSingle();

  if (!data) {
    return defaults;
  }

  return {
    emailSubject: (data.email_subject as string | null) || defaults.emailSubject,
    emailHeadline: (data.email_headline as string | null) || defaults.emailHeadline,
    emailIntro: (data.email_intro as string | null) || defaults.emailIntro,
    emailBody: (data.email_body as string | null) || defaults.emailBody,
    buttonLabel: (data.button_label as string | null) || defaults.buttonLabel,
    shareNote: (data.share_note as string | null) || defaults.shareNote,
    heroImageUrl: (data.hero_image_url as string | null) || defaults.heroImageUrl || null,
  };
}

async function getClientIdsForEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !hasSupabaseEnv) {
    return [] as Array<{ id: string; fullName: string }>;
  }

  const admin = createAdminClient();
  if (!admin) {
    return [] as Array<{ id: string; fullName: string }>;
  }

  const { data } = await admin
    .from("clients")
    .select("id, full_name")
    .ilike("email", normalized);

  return (data || []).map((row) => ({
    id: String(row.id),
    fullName: String(row.full_name || ""),
  }));
}

export async function portalEmailCanAccessProject(email: string, projectId: string) {
  const clients = await getClientIdsForEmail(email);
  if (clients.length === 0) {
    return false;
  }

  const admin = createAdminClient();
  if (!admin) {
    return false;
  }

  const { data } = await admin
    .from("project_clients")
    .select("id")
    .eq("project_id", projectId)
    .in("client_id", clients.map((client) => client.id))
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

export async function getPortalGalleriesForEmail(email: string): Promise<PortalGallery[]> {
  if (!hasSupabaseEnv) {
    return [];
  }

  const admin = createAdminClient();
  if (!admin) {
    return [];
  }

  const clients = await getClientIdsForEmail(email);
  if (clients.length === 0) {
    return [];
  }

  const clientIds = clients.map((client) => client.id);
  const { data: projectLinks } = await admin
    .from("project_clients")
    .select("project_id")
    .in("client_id", clientIds);

  const projectIds = Array.from(new Set((projectLinks || []).map((row) => String(row.project_id))));
  if (projectIds.length === 0) {
    return [];
  }

  const [{ data: galleries }, { data: projects }] = await Promise.all([
    admin
      .from("galleries")
      .select("id, project_id, slug, title, cover_media_id, is_published")
      .in("project_id", projectIds)
      .eq("is_published", true),
    admin.from("projects").select("id, title, event_date").in("id", projectIds),
  ]);

  const publishedGalleries = galleries || [];
  if (publishedGalleries.length === 0) {
    return [];
  }

  const projectById = new Map(
    (projects || []).map((row) => [String(row.id), { title: String(row.title || ""), eventDate: (row.event_date as string | null) || null }]),
  );

  const galleryIds = publishedGalleries.map((row) => String(row.id));
  const { data: media } = await admin
    .from("media_assets")
    .select("id, gallery_id, storage_path, is_cover, sort_order")
    .in("gallery_id", galleryIds)
    .order("sort_order", { ascending: true });

  const mediaByGalleryId = new Map<string, Array<{ id: string; storagePath: string; isCover: boolean }>>();
  (media || []).forEach((row) => {
    const galleryId = String(row.gallery_id);
    const list = mediaByGalleryId.get(galleryId) || [];
    list.push({
      id: String(row.id),
      storagePath: String(row.storage_path),
      isCover: Boolean(row.is_cover),
    });
    mediaByGalleryId.set(galleryId, list);
  });

  return Promise.all(
    publishedGalleries.map(async (row) => {
      const galleryId = String(row.id);
      const projectId = String(row.project_id);
      const project = projectById.get(projectId);
      const assets = mediaByGalleryId.get(galleryId) || [];
      const cover = assets.find((asset) => asset.isCover) || assets[0] || null;
      let coverUrl: string | null = null;
      if (cover) {
        try {
          coverUrl = await getSignedMediaUrl(cover.storagePath, 60 * 60 * 24 * 7);
        } catch {
          coverUrl = null;
        }
      }

      return {
        galleryId,
        projectId,
        slug: String(row.slug || ""),
        title: String(row.title || ""),
        projectTitle: project?.title || String(row.title || ""),
        eventDate: project?.eventDate || null,
        coverUrl,
      };
    }),
  );
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
    email: (row.email as string | null) || (row.contact_info as string | null) || null,
    phone: (row.phone as string | null) || null,
    authUserId: (row.auth_user_id as string | null) || null,
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

export async function createGuestLink(
  galleryId: string,
  createdBy: string,
  expiresAt?: Date,
  mediaAssetIds?: string[],
): Promise<{ token: string; id: string } | null> {
  if (!hasSupabaseEnv) {
    return null;
  }

  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const token = randomBytes(24).toString("base64url");
  const hasSelection = Array.isArray(mediaAssetIds) && mediaAssetIds.length > 0;

  const { data, error } = await admin
    .from("guest_gallery_links")
    .insert({
      gallery_id: galleryId,
      token,
      created_by: createdBy,
      expires_at: expiresAt?.toISOString() || null,
      share_scope: hasSelection ? "selection" : "full",
      media_asset_ids: hasSelection ? mediaAssetIds : null,
    })
    .select()
    .single();

  if (error || !data) {
    return null;
  }

  return {
    token,
    id: String(data.id),
  };
}

export async function getGuestLinksByGallery(galleryId: string): Promise<GuestGalleryLink[]> {
  if (!hasSupabaseEnv) {
    return [];
  }

  const admin = createAdminClient();
  if (!admin) {
    return [];
  }

  const { data } = await admin
    .from("guest_gallery_links")
    .select("id, token, created_at, expires_at, is_active, access_count, last_accessed_at, share_scope, media_asset_ids")
    .eq("gallery_id", galleryId)
    .order("created_at", { ascending: false });

  return (data || []).map((row) => ({
    id: String(row.id),
    token: String(row.token),
    createdAt: String(row.created_at),
    expiresAt: (row.expires_at as string | null) || null,
    isActive: Boolean(row.is_active),
    accessCount: Number(row.access_count || 0),
    lastAccessedAt: (row.last_accessed_at as string | null) || null,
    shareScope: (row.share_scope as "full" | "selection" | null) || "full",
    mediaAssetIds: Array.isArray(row.media_asset_ids)
      ? row.media_asset_ids.map((id) => String(id))
      : null,
  }));
}

export async function getGuestAccessByToken(token: string): Promise<{
  galleryId: string;
  mediaAssetIds: string[] | null;
} | null> {
  if (!hasSupabaseEnv) {
    return null;
  }

  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from("guest_gallery_links")
    .select("gallery_id, is_active, expires_at, access_count, media_asset_ids")
    .eq("token", token)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    return null;
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null;
  }

  // Update access count and last accessed time
  const currentCount = Number(data.access_count || 0);
  await admin
    .from("guest_gallery_links")
    .update({
      access_count: currentCount + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq("token", token);

  return {
    galleryId: String(data.gallery_id),
    mediaAssetIds: Array.isArray(data.media_asset_ids)
      ? data.media_asset_ids.map((id) => String(id))
      : null,
  };
}

export async function getGalleryByGuestToken(token: string) {
  const access = await getGuestAccessByToken(token);
  if (!access) {
    return null;
  }

  const detail = await getGalleryById(access.galleryId);
  if (!detail) {
    return null;
  }

  if (!access.mediaAssetIds || access.mediaAssetIds.length === 0) {
    return detail;
  }

  const allowed = new Set(access.mediaAssetIds);
  return {
    ...detail,
    mediaAssets: detail.mediaAssets.filter((asset) => allowed.has(asset.id)),
  };
}

export async function revokeGuestLink(linkId: string): Promise<boolean> {
  if (!hasSupabaseEnv) {
    return false;
  }

  const admin = createAdminClient();
  if (!admin) {
    return false;
  }

  const { error } = await admin.from("guest_gallery_links").update({ is_active: false }).eq("id", linkId);

  return !error;
}