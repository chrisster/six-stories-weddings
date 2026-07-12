import { NextResponse, type NextRequest } from "next/server";

import { getPublicGalleryBySlug, logGalleryEvent } from "@/lib/data";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const body = (await request.json().catch(() => null)) as { session?: string } | null;
  const session = String(body?.session || "").trim() || null;

  const detail = await getPublicGalleryBySlug(gallerySlug);
  if (!detail) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  await logGalleryEvent(detail.gallery.id, "view", { session });
  return NextResponse.json({ ok: true });
}
