import { randomBytes } from "node:crypto";
import { cache } from "react";

import {
  demoContacts,
  demoCrewMembersList,
  demoGallery,
  demoGalleryDetail,
  demoProject,
} from "@/lib/demo-data";
import { hasSupabaseEnv } from "@/lib/env";
import { resolveEmailHeroUrl, normalizeHeroOverride } from "@/lib/gallery-hero";
import { buildDefaultGalleryNotificationTemplate } from "@/lib/gallery-notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMediaThumbUrl, getSignedMediaUrl } from "@/lib/storage";
import type {
  ClientPortalAccountSummary,
  Contact,
  CrewMember,
  Gallery,
  GalleryDetail,
  GuestGalleryLink,
  GalleryNotificationTemplate,
  MediaAsset,
  PortalGallery,
  Project,
  ProjectTask,
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

function normalizeProject(
  row: Record<string, unknown>,
  coverImageUrl?: string | null,
  coverOriginalUrl?: string | null,
): Project {
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
    status: (String(task.status || "todo") as ProjectTask["status"]) || "todo",
    kind: (task.kind as "photo_edit" | "video_edit" | null) || null,
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
    coverOriginalUrl: coverOriginalUrl || null,
    clients,
    crewAssignments,
    tasks,
    deliverables,
  };
}

const PROJECT_SELECT = `
      *,
      clients:project_clients(client:clients(*)),
      crew_assignments(*, crew_member:crew_members(*)),
      project_tasks(*),
      deliverables(*)
    `;

/** Flattens the project_clients join into the plain clients array normalizeProject expects. */
function flattenProjectRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    clients: ((row.clients as { client: Record<string, unknown> }[] | null) || []).map((c) => c.client),
  };
}

type GalleryCoverRow = {
  id: string;
  projectId: string;
  coverMediaId: string | null;
  heroImagePath: string | null;
};

/**
 * Storage path of the image that represents each gallery. Priority:
 *   1. the selected cover photo (cover_media_id, or the is_cover flag when the
 *      two are out of sync),
 *   2. a custom uploaded hero image,
 *   3. the first uploaded photo.
 * Covers are looked up by id rather than by scanning every media row: a
 * gallery's media list runs into PostgREST's row cap once it holds hundreds of
 * photos. Two round trips, plus a third only for galleries with neither a
 * cover nor a hero.
 */
async function resolveGalleryCoverPaths(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  galleries: GalleryCoverRow[],
): Promise<Map<string, string>> {
  const coverPathByGalleryId = new Map<string, string>();
  if (galleries.length === 0) {
    return coverPathByGalleryId;
  }

  const galleryIds = galleries.map((gallery) => gallery.id);
  const selectedCoverIds = Array.from(
    new Set(galleries.map((gallery) => gallery.coverMediaId).filter((id): id is string => Boolean(id))),
  );

  const [selectedCoverRows, flaggedCoverRows] = await Promise.all([
    selectedCoverIds.length > 0
      ? admin
          .from("media_assets")
          .select("id, storage_path")
          .in("id", selectedCoverIds)
          .then(({ data }) => (data || []) as Array<{ id: unknown; storage_path: unknown }>)
      : Promise.resolve([] as Array<{ id: unknown; storage_path: unknown }>),
    admin
      .from("media_assets")
      .select("gallery_id, storage_path")
      .in("gallery_id", galleryIds)
      .eq("is_cover", true)
      .then(({ data }) => (data || []) as Array<{ gallery_id: unknown; storage_path: unknown }>),
  ]);

  const selectedPathByMediaId = new Map(
    selectedCoverRows.map((row) => [String(row.id), String(row.storage_path)]),
  );
  galleries.forEach((gallery) => {
    const selectedPath = gallery.coverMediaId ? selectedPathByMediaId.get(gallery.coverMediaId) : null;
    if (selectedPath) {
      coverPathByGalleryId.set(gallery.id, selectedPath);
    }
  });
  flaggedCoverRows.forEach((row) => {
    const galleryId = String(row.gallery_id);
    if (!coverPathByGalleryId.has(galleryId)) {
      coverPathByGalleryId.set(galleryId, String(row.storage_path));
    }
  });
  galleries.forEach((gallery) => {
    if (!coverPathByGalleryId.has(gallery.id) && gallery.heroImagePath) {
      coverPathByGalleryId.set(gallery.id, gallery.heroImagePath);
    }
  });

  const fallbackIds = galleries
    .filter((gallery) => !coverPathByGalleryId.has(gallery.id))
    .map((gallery) => gallery.id);
  if (fallbackIds.length > 0) {
    // One query through the gallery_first_photo view (migration 0030); one
    // round trip per gallery until that migration has been applied.
    const { data: viewRows, error: viewError } = await admin
      .from("gallery_first_photo")
      .select("gallery_id, storage_path")
      .in("gallery_id", fallbackIds);

    if (!viewError && viewRows) {
      viewRows.forEach((row) => {
        if (row.storage_path) {
          coverPathByGalleryId.set(String(row.gallery_id), String(row.storage_path));
        }
      });
    } else {
      const firstPhotos = await Promise.all(
        fallbackIds.map(async (galleryId) => {
          const { data: firstPhoto } = await admin
            .from("media_assets")
            .select("storage_path")
            .eq("gallery_id", galleryId)
            .eq("media_type", "photo")
            .order("sort_order", { ascending: true })
            .limit(1)
            .maybeSingle();
          return { galleryId, storagePath: (firstPhoto?.storage_path as string | null) || null };
        }),
      );
      firstPhotos.forEach(({ galleryId, storagePath }) => {
        if (storagePath) {
          coverPathByGalleryId.set(galleryId, storagePath);
        }
      });
    }
  }

  return coverPathByGalleryId;
}

async function loadProjects(withCovers: boolean): Promise<Project[]> {
  if (!hasSupabaseEnv) {
    return [demoProject];
  }

  const admin = createAdminClient();
  if (!admin) {
    return [demoProject];
  }

  const { data, error } = await admin
    .from("projects")
    .select(PROJECT_SELECT)
    .order("event_date", { ascending: true });

  if (error || !data) {
    return [demoProject];
  }

  const rows = data.map((row) => flattenProjectRow(row as Record<string, unknown>));

  // Pages that never show a thumbnail (tasks, financials, contracts) skip the
  // gallery and cover lookups entirely.
  if (!withCovers) {
    return rows.map((row) => normalizeProject(row, null));
  }

  const { data: galleries } = await admin
    .from("galleries")
    .select("id, project_id, cover_media_id, hero_image_path")
    .in(
      "project_id",
      rows.map((row) => String(row.id)),
    );

  const galleryRows: GalleryCoverRow[] = (galleries || []).map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    coverMediaId: (row.cover_media_id as string | null) || null,
    heroImagePath: (row.hero_image_path as string | null) || null,
  }));
  const coverPathByGalleryId = await resolveGalleryCoverPaths(admin, galleryRows);

  // A project can have more than one gallery; the first gallery with an image wins.
  const coverPathByProjectId = new Map<string, string>();
  galleryRows.forEach((gallery) => {
    const path = coverPathByGalleryId.get(gallery.id);
    if (path && !coverPathByProjectId.has(gallery.projectId)) {
      coverPathByProjectId.set(gallery.projectId, path);
    }
  });

  return Promise.all(
    rows.map(async (row) => {
      const coverStoragePath = coverPathByProjectId.get(String(row.id)) || null;
      let coverImageUrl: string | null = null;
      let coverOriginalUrl: string | null = null;
      if (coverStoragePath) {
        try {
          // Cards are 160px tall: the 480px preview, not the original. Custom
          // hero images have no preview objects and are already downscaled.
          coverOriginalUrl = await getSignedMediaUrl(coverStoragePath, 60 * 60 * 24 * 7);
          coverImageUrl = coverStoragePath.includes("/hero/")
            ? coverOriginalUrl
            : getMediaThumbUrl(coverStoragePath, { size: "sm" });
        } catch {
          coverImageUrl = coverStoragePath;
        }
      }
      return normalizeProject(row, coverImageUrl, coverOriginalUrl);
    }),
  );
}

const loadProjectsMemo = cache(loadProjects);

/**
 * Every project with clients, crew, tasks and deliverables. Memoized per
 * request, so a layout and page (or 33 gallery cards) that all need the list
 * share one load. `covers: false` skips the cover-photo lookups for pages that
 * never render a thumbnail.
 */
export function getProjects(options?: { covers?: boolean }): Promise<Project[]> {
  return loadProjectsMemo(options?.covers ?? true);
}

/**
 * One project by id in a single query. It used to load every project and pick
 * one out of the array. Cover images are not resolved here: only the listing
 * pages show them, and they render the full list.
 */
export const getProjectById = cache(async (projectId: string): Promise<Project | null> => {
  if (!projectId) {
    return null;
  }

  if (!hasSupabaseEnv) {
    return demoProject.id === projectId ? demoProject : null;
  }

  const admin = createAdminClient();
  if (!admin) {
    return demoProject.id === projectId ? demoProject : null;
  }

  const { data, error } = await admin
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", projectId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return normalizeProject(flattenProjectRow(data as Record<string, unknown>), null);
});

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

async function loadGalleries(): Promise<Gallery[]> {
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
    allowComments: Boolean(row.allow_comments),
    hasPasscode: Boolean(row.passcode_hash),
    passcodeHash: row.passcode_hash as string | null,
    coverMediaId: row.cover_media_id as string | null,
  })) as Gallery[];
}

export const getGalleries = cache(loadGalleries);

const MEDIA_SELECT =
  "id, gallery_id, section_id, storage_path, media_type, sort_order, is_cover, original_name, width, height, metadata_json";

function normalizeGalleryRow(row: Record<string, unknown>): Gallery {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    slug: String(row.slug),
    title: String(row.title),
    isPublished: Boolean(row.is_published),
    allowDownloads: Boolean(row.allow_downloads),
    allowComments: Boolean(row.allow_comments),
    hasPasscode: Boolean(row.passcode_hash),
    passcodeHash: row.passcode_hash as string | null,
    coverMediaId: row.cover_media_id as string | null,
    heroImagePath: (row.hero_image_path as string | null) || null,
  };
}

function normalizeMediaRow(row: Record<string, unknown>): MediaAsset {
  const metadata = (row.metadata_json as Record<string, unknown> | null) || null;
  const width = Number(row.width);
  const height = Number(row.height);
  return {
    id: String(row.id),
    galleryId: String(row.gallery_id),
    sectionId: (row.section_id as string | null) || null,
    storagePath: String(row.storage_path),
    mediaType: (row.media_type as "photo" | "video") || "photo",
    sortOrder: Number(row.sort_order || 0),
    isCover: Boolean(row.is_cover),
    originalName: (row.original_name as string | null) || null,
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
    thumbnailPath: metadata && typeof metadata.thumbnail_path === "string" ? metadata.thumbnail_path : null,
  };
}

/**
 * Every media row of a gallery in sort order. Supabase caps a single select at
 * 1000 rows and galleries can hold more, so this pages through the table;
 * only the columns the pages use are selected.
 */
async function loadGalleryMedia(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  galleryId: string,
): Promise<MediaAsset[]> {
  const rows: MediaAsset[] = [];
  const MEDIA_PAGE_SIZE = 1000;
  for (let from = 0; ; from += MEDIA_PAGE_SIZE) {
    const { data, error } = await admin
      .from("media_assets")
      .select(MEDIA_SELECT)
      .eq("gallery_id", galleryId)
      .order("sort_order", { ascending: true })
      .range(from, from + MEDIA_PAGE_SIZE - 1);

    if (error || !data || data.length === 0) {
      break;
    }
    rows.push(...data.map((row) => normalizeMediaRow(row as Record<string, unknown>)));
    if (data.length < MEDIA_PAGE_SIZE) {
      break;
    }
  }
  return rows;
}

async function buildGalleryDetail(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  galleryRow: Record<string, unknown>,
): Promise<GalleryDetail | null> {
  const galleryId = String(galleryRow.id);

  // The project, the sections and the media rows are independent of each
  // other: one round trip instead of three.
  const [project, sections, mediaAssets] = await Promise.all([
    getProjectById(String(galleryRow.project_id)),
    admin
      .from("gallery_sections")
      .select("id, gallery_id, name, sort_order")
      .eq("gallery_id", galleryId)
      .order("sort_order", { ascending: true }),
    loadGalleryMedia(admin, galleryId),
  ]);

  if (!project) {
    return null;
  }

  return {
    gallery: normalizeGalleryRow(galleryRow),
    project,
    sections: (sections.data || []).map((row) => ({
      id: String(row.id),
      galleryId: String(row.gallery_id),
      name: String(row.name),
      sortOrder: Number(row.sort_order),
    })),
    mediaAssets,
  };
}

export const getGalleryById = cache(async (galleryId: string): Promise<GalleryDetail | null> => {
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

  const { data: galleryRow } = await admin.from("galleries").select("*").eq("id", galleryId).maybeSingle();
  if (!galleryRow) {
    return null;
  }

  return buildGalleryDetail(admin, galleryRow as Record<string, unknown>);
});

export const getPublicGalleryBySlug = cache(async (slug: string): Promise<GalleryDetail | null> => {
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
    .maybeSingle();

  if (!galleryRow) {
    return null;
  }

  return buildGalleryDetail(admin, galleryRow as Record<string, unknown>);
});

export type PublishedGalleryAccess = {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  projectTitle: string;
  allowDownloads: boolean;
  allowComments: boolean;
  passcodeHash: string | null;
};

/**
 * The published gallery row only (plus the project title): everything the
 * view, favorites, comments, share, download and unlock handlers need. They
 * used to load every media row and every project to get here.
 */
export const getPublishedGalleryAccess = cache(
  async (slug: string): Promise<PublishedGalleryAccess | null> => {
    if (!hasSupabaseEnv) {
      const detail = await getPublicGalleryBySlug(slug);
      return detail
        ? {
            id: detail.gallery.id,
            projectId: detail.project.id,
            slug: detail.gallery.slug,
            title: detail.gallery.title,
            projectTitle: detail.project.title,
            allowDownloads: detail.gallery.allowDownloads,
            allowComments: detail.gallery.allowComments,
            passcodeHash: detail.gallery.passcodeHash || null,
          }
        : null;
    }

    const admin = createAdminClient();
    if (!admin) {
      return null;
    }

    const { data } = await admin
      .from("galleries")
      .select(
        "id, project_id, slug, title, allow_downloads, allow_comments, passcode_hash, project:projects(title)",
      )
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (!data) {
      return null;
    }

    const project = data.project as { title?: string | null } | Array<{ title?: string | null }> | null;
    const projectTitle = Array.isArray(project) ? project[0]?.title : project?.title;

    return {
      id: String(data.id),
      projectId: String(data.project_id),
      slug: String(data.slug),
      title: String(data.title || ""),
      projectTitle: String(projectTitle || data.title || ""),
      allowDownloads: Boolean(data.allow_downloads),
      allowComments: Boolean(data.allow_comments),
      passcodeHash: (data.passcode_hash as string | null) || null,
    };
  },
);

/** One media row, scoped to its gallery so handlers validate ownership in a single query. */
export async function getMediaAssetInGallery(
  galleryId: string,
  assetId: string,
): Promise<MediaAsset | null> {
  if (!galleryId || !assetId) {
    return null;
  }

  if (!hasSupabaseEnv) {
    const detail = await getGalleryById(galleryId);
    return detail?.mediaAssets.find((asset) => asset.id === assetId) || null;
  }

  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data } = await admin
    .from("media_assets")
    .select(MEDIA_SELECT)
    .eq("gallery_id", galleryId)
    .eq("id", assetId)
    .maybeSingle();

  return data ? normalizeMediaRow(data as Record<string, unknown>) : null;
}

/** Ids of every media row in a gallery, in sort order (one narrow, paged query). */
export async function getMediaAssetIdsInGallery(galleryId: string): Promise<string[]> {
  if (!galleryId) {
    return [];
  }

  if (!hasSupabaseEnv) {
    const detail = await getGalleryById(galleryId);
    return (detail?.mediaAssets || []).map((asset) => asset.id);
  }

  const admin = createAdminClient();
  if (!admin) {
    return [];
  }

  const ids: string[] = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("media_assets")
      .select("id")
      .eq("gallery_id", galleryId)
      .order("sort_order", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) {
      break;
    }
    ids.push(...data.map((row) => String(row.id)));
    if (data.length < PAGE_SIZE) {
      break;
    }
  }
  return ids;
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
  // Legal identity — appears in the counterparty block of contracts.
  legalName: string;
  vatId: string;
  taxOffice: string;
  registryNo: string;
  representativeName: string;
  city: string;
  bankName: string;
  bankIban: string;
  signatureImageUrl: string;
  contractCcEmail: string;
};

async function loadOrganizationSettings(): Promise<OrganizationSettings> {
  const empty: OrganizationSettings = {
    studioName: "",
    contactEmail: "",
    replyToEmail: "",
    phone: "",
    website: "",
    address: "",
    legalName: "",
    vatId: "",
    taxOffice: "",
    registryNo: "",
    representativeName: "",
    city: "",
    bankName: "",
    bankIban: "",
    signatureImageUrl: "",
    contractCcEmail: "",
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
    legalName: String(data.legal_name || ""),
    vatId: String(data.vat_id || ""),
    taxOffice: String(data.tax_office || ""),
    registryNo: String(data.registry_no || ""),
    representativeName: String(data.representative_name || ""),
    city: String(data.city || ""),
    bankName: String(data.bank_name || ""),
    bankIban: String(data.bank_iban || ""),
    signatureImageUrl: String(data.signature_image_url || ""),
    contractCcEmail: String(data.contract_cc_email || ""),
  };
}

export const getOrganizationSettings = cache(loadOrganizationSettings);

export const getCrewMemberIdsForEmail = cache(async (email: string): Promise<string[]> => {
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

  return (members || []).map((row) => String(row.id));
});

export const getAssignedProjectIdsForEmail = cache(async (email: string): Promise<string[]> => {
  const normalized = (email || "").trim().toLowerCase();
  if (!hasSupabaseEnv || !normalized) {
    return [];
  }

  const admin = createAdminClient();
  if (!admin) {
    return [];
  }

  const memberIds = await getCrewMemberIdsForEmail(normalized);
  if (memberIds.length === 0) {
    return [];
  }

  const { data: assignments } = await admin
    .from("crew_assignments")
    .select("project_id")
    .in("crew_member_id", memberIds);

  return Array.from(new Set((assignments || []).map((row) => String(row.project_id))));
});

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export async function createNotification(
  recipientEmail: string,
  payload: { type?: string; title: string; body?: string | null; link?: string | null },
): Promise<void> {
  const email = (recipientEmail || "").trim().toLowerCase();
  if (!hasSupabaseEnv || !email || !payload.title) {
    return;
  }
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("notifications").insert({
    recipient_email: email,
    type: payload.type || "general",
    title: payload.title,
    body: payload.body || null,
    link: payload.link || null,
  });
}

export async function notifyCrewMemberById(
  crewMemberId: string,
  payload: { type?: string; title: string; body?: string | null; link?: string | null },
  actorEmail?: string | null,
): Promise<void> {
  if (!hasSupabaseEnv || !crewMemberId) return;
  const admin = createAdminClient();
  if (!admin) return;
  const { data: member } = await admin
    .from("crew_members")
    .select("email, contact_info")
    .eq("id", crewMemberId)
    .maybeSingle();
  const email = String(member?.email || member?.contact_info || "").trim().toLowerCase();
  if (!email) return;
  if (actorEmail && actorEmail.trim().toLowerCase() === email) return;
  await createNotification(email, payload);
}

export async function getNotificationsForEmail(
  email: string,
  limit = 20,
): Promise<NotificationItem[]> {
  const normalized = (email || "").trim().toLowerCase();
  if (!hasSupabaseEnv || !normalized) return [];
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin
    .from("notifications")
    .select("id, type, title, body, link, read, created_at")
    .eq("recipient_email", normalized)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []).map((row) => ({
    id: String(row.id),
    type: String(row.type || "general"),
    title: String(row.title || ""),
    body: (row.body as string | null) || null,
    link: (row.link as string | null) || null,
    read: Boolean(row.read),
    createdAt: String(row.created_at || ""),
  }));
}

export async function markNotificationsRead(email: string, ids?: string[]): Promise<void> {
  const normalized = (email || "").trim().toLowerCase();
  if (!hasSupabaseEnv || !normalized) return;
  const admin = createAdminClient();
  if (!admin) return;
  let query = admin.from("notifications").update({ read: true }).eq("recipient_email", normalized);
  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  } else {
    query = query.eq("read", false);
  }
  await query;
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

  // Preferred path: totals computed in SQL by the gallery_event_stats function
  // (migration 0030). One small result set instead of every event row.
  const { data: aggregated, error: rpcError } = await admin.rpc("gallery_event_stats", {
    since_at: since ? since.toISOString() : null,
    gallery_ids: galleryIds && galleryIds.length > 0 ? galleryIds : null,
  });

  if (!rpcError && Array.isArray(aggregated)) {
    const byGalleryFromSql: Record<string, { views: number; downloads: number; viewers: number }> = {};
    let views = 0;
    let viewers = 0;
    let downloads = 0;
    const downloadGalleries = new Set<string>();
    (aggregated as Array<Record<string, unknown>>).forEach((row) => {
      const galleryId = String(row.gallery_id);
      const entry = {
        views: Number(row.views || 0),
        downloads: Number(row.downloads || 0),
        viewers: Number(row.viewers || 0),
      };
      byGalleryFromSql[galleryId] = entry;
      views += entry.views;
      // A visitor rarely opens more than one gallery, so the sum of per-gallery
      // distinct sessions is a close upper bound of the global figure.
      viewers += entry.viewers;
      downloads += entry.downloads;
      if (entry.downloads > 0) downloadGalleries.add(galleryId);
    });
    return {
      totals: { views, viewers, downloads, galleriesWithDownloads: downloadGalleries.size },
      byGallery: byGalleryFromSql,
    };
  }

  // Fallback until the migration is applied: page through the raw events
  // (PostgREST returns at most 1000 rows per request) and count here.
  const rows: Array<{ gallery_id: unknown; event_type: unknown; guest_session_id: unknown }> = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = admin
      .from("gallery_events")
      .select("gallery_id, event_type, guest_session_id")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (galleryIds && galleryIds.length > 0) {
      query = query.in("gallery_id", galleryIds);
    }
    if (since) {
      query = query.gte("created_at", since.toISOString());
    }
    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      break;
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) {
      break;
    }
  }

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
    .select("id, email, password_hash, is_active, last_login_at, last_notified_at")
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
      lastLoginAt: (row.last_login_at as string | null) || null,
      lastNotifiedAt: (row.last_notified_at as string | null) || null,
    };
  });

  return map;
}

/**
 * @param fallback.heroImageUrl  The gallery's current hero (uploaded image or
 *                               cover preview). Used unless the studio typed
 *                               an external override into the template.
 */
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
    heroImageUrl: resolveEmailHeroUrl(data.hero_image_url as string | null, defaults.heroImageUrl ?? null),
    heroImageOverride: normalizeHeroOverride(data.hero_image_url as string | null),
  };
}

/**
 * The client records behind a portal email. Matching is case-insensitive but
 * exact: ilike treats `_`, `%` and `*` as wildcards, so its rows are compared
 * again here, or a portal account like `a_b@x.com` would inherit the galleries
 * of `axb@x.com`.
 */
export async function getClientIdsForEmail(email: string) {
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
    .select("id, full_name, email")
    .ilike("email", normalized);

  return (data || [])
    .filter((row) => String(row.email || "").trim().toLowerCase() === normalized)
    .map((row) => ({
      id: String(row.id),
      fullName: String(row.full_name || ""),
    }));
}

export const portalEmailCanAccessProject = cache(async (email: string, projectId: string) => {
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
});

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
      .select("id, project_id, slug, title, cover_media_id, hero_image_path, is_published")
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

  // Cover lookups by id instead of loading every media row of every gallery.
  const coverPathByGalleryId = await resolveGalleryCoverPaths(
    admin,
    publishedGalleries.map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      coverMediaId: (row.cover_media_id as string | null) || null,
      heroImagePath: (row.hero_image_path as string | null) || null,
    })),
  );

  return Promise.all(
    publishedGalleries.map(async (row) => {
      const galleryId = String(row.id);
      const projectId = String(row.project_id);
      const project = projectById.get(projectId);
      let coverUrl: string | null = null;
      const coverStoragePath = coverPathByGalleryId.get(galleryId) || null;
      if (coverStoragePath) {
        try {
          coverUrl = await getSignedMediaUrl(coverStoragePath, 60 * 60 * 24 * 7);
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

async function loadCrewMembers(): Promise<CrewMember[]> {
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

export const getCrewMembers = cache(loadCrewMembers);

async function loadContacts(): Promise<Contact[]> {
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

export const getContacts = cache(loadContacts);

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