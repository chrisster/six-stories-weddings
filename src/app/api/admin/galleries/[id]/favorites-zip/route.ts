import { NextResponse } from "next/server";

import { getStudioUser } from "@/lib/auth";
import { getGalleryById, getGalleryFavorites } from "@/lib/data";
import { isR2PublicEnabled } from "@/lib/storage";
import { assetSetHash, ensureZipInStorage, slugifyName } from "@/lib/zip-archive";

export const runtime = "nodejs";
export const maxDuration = 800;

// Admin: a zip of the photos clients hearted in a gallery (videos are left
// out — they are large and already listed by name). Works whether or not the
// gallery allows client downloads. Cached in storage by content, so a repeat
// download with the same favorites is instant.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getStudioUser())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isR2PublicEnabled()) {
    return new NextResponse("Archive storage is not configured.", { status: 503 });
  }

  const { id } = await params;
  const [detail, favorites] = await Promise.all([getGalleryById(id), getGalleryFavorites(id)]);
  if (!detail) {
    return new NextResponse("Not found", { status: 404 });
  }

  const photos = detail.mediaAssets.filter(
    (asset) => asset.mediaType !== "video" && favorites.counts[asset.id],
  );
  if (photos.length === 0) {
    return new NextResponse("No favorite photos yet.", { status: 404 });
  }

  const zipName = `${slugifyName(detail.project.title || detail.gallery.title)}-favorites.zip`;
  const key = `zips/${detail.gallery.id}/fav-${assetSetHash(photos)}.zip`;
  const url = await ensureZipInStorage(key, zipName, photos);
  return NextResponse.redirect(url, 302);
}
