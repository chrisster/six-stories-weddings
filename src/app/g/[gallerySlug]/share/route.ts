import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  createGuestLink,
  getGuestAccessByToken,
  getPublicGalleryBySlug,
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
  const detail = await getPublicGalleryBySlug(gallerySlug);
  if (!detail) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as CreateShareBody | null;
  const selectedAssetIds = Array.isArray(body?.assetIds)
    ? body.assetIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const shareAll = Boolean(body?.shareAll);
  const currentToken = String(body?.currentToken || "").trim();

  const adminUser = await getCurrentUser();
  const portalSession = await readPortalSession();
  const hasPortalAccess = portalSession
    ? await portalEmailCanAccessProject(portalSession.email, detail.project.id)
    : false;

  let guestAllowedIds: string[] | null = null;
  let hasGuestAccess = false;
  if (!adminUser && !hasPortalAccess && currentToken) {
    const guestAccess = await getGuestAccessByToken(currentToken);
    if (guestAccess && guestAccess.galleryId === detail.gallery.id) {
      guestAllowedIds = guestAccess.mediaAssetIds;
      hasGuestAccess = true;
    }
  }

  const canCreateShareLink = Boolean(adminUser || hasPortalAccess || hasGuestAccess);
  if (!canCreateShareLink) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const allGalleryIds = new Set(detail.mediaAssets.map((asset) => asset.id));
  const allowedByGuest = guestAllowedIds ? new Set(guestAllowedIds) : null;

  let mediaAssetIdsForShare: string[] | undefined;
  if (shareAll) {
    if (allowedByGuest) {
      mediaAssetIdsForShare = detail.mediaAssets
        .map((asset) => asset.id)
        .filter((id) => allowedByGuest.has(id));
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
    detail.gallery.id,
    createdBy,
    undefined,
    mediaAssetIdsForShare && mediaAssetIdsForShare.length > 0 ? mediaAssetIdsForShare : undefined,
  );

  if (!created) {
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }

  const appUrl = getAppUrl().replace(/\/$/, "");
  const shareUrl = `${appUrl}/g/${detail.gallery.slug}?token=${encodeURIComponent(created.token)}`;
  return NextResponse.json({ ok: true, shareUrl });
}
