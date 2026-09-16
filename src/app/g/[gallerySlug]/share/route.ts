import { NextResponse, type NextRequest } from "next/server";

import { getStudioUser } from "@/lib/auth";
import {
  createGuestLink,
  getGuestAccessByToken,
  getMediaAssetIdsInGallery,
  getPublishedGalleryAccess,
  portalEmailCanAccessProject,
} from "@/lib/data";
import { getAppUrl } from "@/lib/env";
import { readPortalSession } from "@/lib/portal-auth";

type CreateShareBody = {
  shareAll?: boolean;
  assetIds?: string[];
  currentToken?: string;
};

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

  const body = (await request.json().catch(() => null)) as CreateShareBody | null;
  const selectedAssetIds = Array.isArray(body?.assetIds)
    ? body.assetIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const shareAll = Boolean(body?.shareAll);
  const currentToken = String(body?.currentToken || "").trim();

  const hasPortalAccess = portalSession
    ? await portalEmailCanAccessProject(portalSession.email, gallery.projectId)
    : false;

  let guestAllowedIds: string[] | null = null;
  let hasGuestAccess = false;
  if (!adminUser && !hasPortalAccess && currentToken) {
    const guestAccess = await getGuestAccessByToken(currentToken);
    if (guestAccess && guestAccess.galleryId === gallery.id) {
      guestAllowedIds = guestAccess.mediaAssetIds;
      hasGuestAccess = true;
    }
  }

  const canCreateShareLink = Boolean(adminUser || hasPortalAccess || hasGuestAccess);
  if (!canCreateShareLink) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const allowedByGuest = guestAllowedIds ? new Set(guestAllowedIds) : null;

  // Only the ids are needed to validate a selection (one narrow query); a
  // full-gallery share by an unrestricted viewer needs none at all.
  const galleryAssetIds =
    shareAll && !allowedByGuest ? [] : await getMediaAssetIdsInGallery(gallery.id);
  const allGalleryIds = new Set(galleryAssetIds);

  let mediaAssetIdsForShare: string[] | undefined;
  if (shareAll) {
    if (allowedByGuest) {
      mediaAssetIdsForShare = galleryAssetIds.filter((id) => allowedByGuest.has(id));
    }
  } else {
    const filtered = selectedAssetIds.filter((id) => allGalleryIds.has(id));
    mediaAssetIdsForShare = allowedByGuest
      ? filtered.filter((id) => allowedByGuest.has(id))
      : filtered;

    if (mediaAssetIdsForShare.length === 0) {
      return NextResponse.json({ error: "No assets selected" }, { status: 400 });
    }
  }

  const createdBy = adminUser?.email || portalSession?.email || `guest:${currentToken.slice(0, 8)}`;
  const created = await createGuestLink(
    gallery.id,
    createdBy,
    undefined,
    mediaAssetIdsForShare && mediaAssetIdsForShare.length > 0 ? mediaAssetIdsForShare : undefined,
  );

  if (!created) {
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }

  const appUrl = getAppUrl().replace(/\/$/, "");
  const shareUrl = `${appUrl}/g/${gallery.slug}?token=${encodeURIComponent(created.token)}`;
  return NextResponse.json({ ok: true, shareUrl });
}
