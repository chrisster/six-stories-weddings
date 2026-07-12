import { NextResponse, type NextRequest } from "next/server";

import { getPublicGalleryBySlug } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

async function resolveGallery(slug: string) {
  const detail = await getPublicGalleryBySlug(slug);
  return detail;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const assetId = request.nextUrl.searchParams.get("asset") || "";

  const detail = await resolveGallery(gallerySlug);
  if (!detail) {
    return NextResponse.json({ comments: [] });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ comments: [] });
  }

  let query = admin
    .from("gallery_comments")
    .select("id, media_asset_id, guest_name, comment_body, timestamp_seconds, created_at")
    .eq("gallery_id", detail.gallery.id)
    .order("timestamp_seconds", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (assetId) {
    query = query.eq("media_asset_id", assetId);
  }

  const { data } = await query;

  return NextResponse.json({
    comments: (data || []).map((row) => ({
      id: String(row.id),
      mediaAssetId: row.media_asset_id ? String(row.media_asset_id) : null,
      guestName: (row.guest_name as string | null) || null,
      body: String(row.comment_body || ""),
      timestampSeconds: row.timestamp_seconds != null ? Number(row.timestamp_seconds) : null,
      createdAt: String(row.created_at || ""),
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const body = (await request.json().catch(() => null)) as {
    mediaAssetId?: string;
    guestName?: string;
    body?: string;
    timestampSeconds?: number | null;
  } | null;

  const mediaAssetId = String(body?.mediaAssetId || "").trim();
  const commentBody = String(body?.body || "").trim();
  const guestName = String(body?.guestName || "").trim();
  const timestampSeconds =
    typeof body?.timestampSeconds === "number" && Number.isFinite(body.timestampSeconds)
      ? Math.max(0, Math.floor(body.timestampSeconds))
      : null;

  if (!mediaAssetId || !commentBody) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  if (commentBody.length > 2000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }

  const detail = await resolveGallery(gallerySlug);
  if (!detail) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  // Ensure the asset belongs to this gallery.
  const asset = detail.mediaAssets.find((item) => item.id === mediaAssetId);
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("gallery_comments")
    .insert({
      gallery_id: detail.gallery.id,
      media_asset_id: mediaAssetId,
      guest_name: guestName || null,
      comment_body: commentBody,
      timestamp_seconds: timestampSeconds,
    })
    .select("id, media_asset_id, guest_name, comment_body, timestamp_seconds, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not save comment" }, { status: 500 });
  }

  return NextResponse.json({
    comment: {
      id: String(data.id),
      mediaAssetId: data.media_asset_id ? String(data.media_asset_id) : null,
      guestName: (data.guest_name as string | null) || null,
      body: String(data.comment_body || ""),
      timestampSeconds: data.timestamp_seconds != null ? Number(data.timestamp_seconds) : null,
      createdAt: String(data.created_at || ""),
    },
  });
}
