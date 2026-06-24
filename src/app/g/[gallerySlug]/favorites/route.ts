import { NextResponse, type NextRequest } from "next/server";
import { getPublicGalleryBySlug } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

async function resolveGalleryId(slug: string): Promise<string | null> {
  const detail = await getPublicGalleryBySlug(slug);
  return detail ? detail.gallery.id : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const session = request.nextUrl.searchParams.get("session") || "";
  if (!session) {
    return NextResponse.json({ favorites: [] });
  }

  const galleryId = await resolveGalleryId(gallerySlug);
  if (!galleryId) {
    return NextResponse.json({ favorites: [] });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ favorites: [] });
  }

  const { data } = await admin
    .from("gallery_favorites")
    .select("media_asset_id")
    .eq("gallery_id", galleryId)
    .eq("guest_session_id", session);

  return NextResponse.json({
    favorites: (data || []).map((row) => String(row.media_asset_id)),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const body = (await request.json().catch(() => null)) as {
    mediaAssetId?: string;
    session?: string;
    favorited?: boolean;
  } | null;

  if (!body?.mediaAssetId || !body.session) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const galleryId = await resolveGalleryId(gallerySlug);
  if (!galleryId) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  if (body.favorited) {
    const { error } = await admin.from("gallery_favorites").upsert(
      {
        gallery_id: galleryId,
        media_asset_id: body.mediaAssetId,
        guest_session_id: body.session,
      },
      { onConflict: "gallery_id,media_asset_id,guest_session_id" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await admin
      .from("gallery_favorites")
      .delete()
      .eq("gallery_id", galleryId)
      .eq("media_asset_id", body.mediaAssetId)
      .eq("guest_session_id", body.session);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
