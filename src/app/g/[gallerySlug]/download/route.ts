import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getGuestAccessByToken,
  getMediaAssetInGallery,
  getPublishedGalleryAccess,
  logGalleryEvent,
  portalEmailCanAccessProject,
} from "@/lib/data";
import { readPortalSession } from "@/lib/portal-auth";
import { getMediaDownloadUrl, getSignedMediaUrl } from "@/lib/storage";

// Authorizes and counts a gallery download, then redirects the browser to a
// signed storage URL that carries the attachment Content-Disposition (and the
// original filename), so the file bytes flow storage→browser without passing
// through this function. Redirect navigation needs no CORS. External demo
// URLs stream through as before since they cannot be signed.
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

  // The gallery row, the admin session, the portal cookie and the guest token
  // resolve together; the gallery's media list is never loaded.
  const [gallery, adminUser, portalSession, guestAccess] = await Promise.all([
    getPublishedGalleryAccess(gallerySlug),
    getCurrentUser(),
    readPortalSession(),
    token ? getGuestAccessByToken(token) : Promise.resolve(null),
  ]);
  if (!gallery || !gallery.allowDownloads) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [asset, hasPortalAccess] = await Promise.all([
    getMediaAssetInGallery(gallery.id, assetId),
    portalSession
      ? portalEmailCanAccessProject(portalSession.email, gallery.projectId)
      : Promise.resolve(false),
  ]);

  const hasGuestAccess = Boolean(guestAccess && guestAccess.galleryId === gallery.id);
  const guestAssetIds = hasGuestAccess ? guestAccess?.mediaAssetIds ?? null : null;

  if (!adminUser && !hasPortalAccess && !hasGuestAccess) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  if (!asset) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (guestAssetIds && guestAssetIds.length > 0 && !guestAssetIds.includes(asset.id)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Count actual downloads (not inline streams) by non-admin viewers.
  if (forceDownload && !adminUser) {
    await logGalleryEvent(gallery.id, "download", { mediaAssetId: asset.id });
  }

  const ext = asset.storagePath.split(".").pop() || "jpg";
  const base = asset.originalName || `photo-${asset.id}`;
  const fileName = /\.[a-z0-9]+$/i.test(base) ? base : `${base}.${ext}`;

  const isExternal = asset.storagePath.startsWith("http://") || asset.storagePath.startsWith("https://");
  if (!isExternal) {
    const downloadUrl = forceDownload
      ? await getMediaDownloadUrl(asset.storagePath, fileName)
      : await getSignedMediaUrl(asset.storagePath);
    return NextResponse.redirect(downloadUrl, 302);
  }

  // External (demo) URLs cannot carry a signed disposition — stream them.
  const upstream = await fetch(asset.storagePath);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Upstream error", { status: 502 });
  }

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
