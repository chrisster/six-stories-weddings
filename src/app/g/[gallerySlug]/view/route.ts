import { NextResponse, type NextRequest } from "next/server";

import { getPublishedGalleryAccess, logGalleryEvent } from "@/lib/data";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const body = (await request.json().catch(() => null)) as { session?: string } | null;
  const session = String(body?.session || "").trim() || null;

  // Logging a view only needs the gallery row; this used to load every media
  // row and every project first.
  const gallery = await getPublishedGalleryAccess(gallerySlug);
  if (!gallery) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  await logGalleryEvent(gallery.id, "view", { session });
  return NextResponse.json({ ok: true });
}
