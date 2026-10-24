import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { getStudioUser } from "@/lib/auth";
import {
  getPublishedGalleryAccess,
  portalEmailCanAccessProject,
  setMediaHiddenFromGuests,
} from "@/lib/data";
import { readPortalSession } from "@/lib/portal-auth";

type HideBody = { assetIds?: unknown; hidden?: unknown };

// Hide media from shared-link guests, or show it again. Only the studio and
// the gallery's clients (every portal account invited to the project) may do
// this — never someone who arrived through a shared link.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const [gallery, adminUser, portalSession] = await Promise.all([
    getPublishedGalleryAccess(gallerySlug),
    getStudioUser(),
    readPortalSession(),
  ]);
  if (!gallery) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  const isClient = portalSession
    ? await portalEmailCanAccessProject(portalSession.email, gallery.projectId)
    : false;
  if (!adminUser && !isClient) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as HideBody | null;
  const assetIds = Array.isArray(body?.assetIds)
    ? body.assetIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 5000)
    : [];
  if (assetIds.length === 0 || typeof body?.hidden !== "boolean") {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await setMediaHiddenFromGuests(gallery.id, assetIds, body.hidden);
  revalidatePath(`/admin/galleries/${gallery.id}`);
  return NextResponse.json({ updated: updated.length });
}
