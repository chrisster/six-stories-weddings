import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getGuestAccessByToken, getPublicGalleryBySlug, logGalleryEvent, portalEmailCanAccessProject } from "@/lib/data";
import { readPortalSession } from "@/lib/portal-auth";
import { getSignedMediaUrl } from "@/lib/storage";

// Streams a gallery media file through our own origin so the browser can
// download it directly (no new tab, no cross-origin CORS issue with R2). When
// `download=1` is set, forces a save dialog with the original filename.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const assetId = request.nextUrl.searchParams.get("asset") || "";
  const forceDownload = request.nextUrl.searchParams.get("download") === "1";
  const token = request.nextUrl.searchParams.get("token") || "";

  if (!assetId) {
    return new NextResponse("Missing asset", { status: 400 });
  }

  const detail = await getPublicGalleryBySlug(gallerySlug);
  if (!detail || !detail.gallery.allowDownloads) {
    return new NextResponse("Not found", { status: 404 });
  }

  const adminUser = await getCurrentUser();
  const portalSession = await readPortalSession();
  const hasPortalAccess = portalSession
    ? await portalEmailCanAccessProject(portalSession.email, detail.project.id)
    : false;

  let guestAssetIds: string[] | null = null;
  let hasGuestAccess = false;
  if (token) {
    const access = await getGuestAccessByToken(token);
    if (access && access.galleryId === detail.gallery.id) {
      hasGuestAccess = true;
      guestAssetIds = access.mediaAssetIds;
    }
  }

  if (!adminUser && !hasPortalAccess && !hasGuestAccess) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  const asset = detail.mediaAssets.find((item) => item.id === assetId);
  if (!asset) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (guestAssetIds && guestAssetIds.length > 0 && !guestAssetIds.includes(asset.id)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Count actual downloads (not inline streams) by non-admin viewers.
  if (forceDownload && !adminUser) {
    await logGalleryEvent(detail.gallery.id, "download", { mediaAssetId: asset.id });
  }

  const signedUrl = await getSignedMediaUrl(asset.storagePath);
  const upstream = await fetch(signedUrl);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Upstream error", { status: 502 });
  }

  const ext = asset.storagePath.split(".").pop() || "jpg";
  const base = asset.originalName || `photo-${asset.id}`;
  const fileName = /\.[a-z0-9]+$/i.test(base) ? base : `${base}.${ext}`;

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  if (forceDownload) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${fileName.replace(/["\\\r\n]/g, "")}"`,
    );
  }
  headers.set("Cache-Control", "private, max-age=3600");

  return new NextResponse(upstream.body, { status: 200, headers });
}
