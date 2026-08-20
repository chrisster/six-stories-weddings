import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteStoredObjects, getSignedMediaUrl, uploadMediaToStorage } from "@/lib/storage";

export const runtime = "nodejs";

// The frame arrives from the admin browser already sized and encoded (canvas
// capture, JPEG, ≤1600px wide), so it is stored as-is. Do not add sharp here:
// importing sharp crashes this deployment's serverless functions at module
// load, which is exactly the bug that shipped in the first version of this
// route.
const MAX_FRAME_BYTES = 4 * 1024 * 1024;

// Receives a single video frame captured in the admin browser and stores it as
// the video's poster/thumbnail. The storage path is kept in the asset's
// metadata_json so no schema migration is needed.
export async function POST(request: Request) {
  try {
    if (!hasSupabaseEnv) {
      return NextResponse.json({ error: "Supabase env vars are missing." }, { status: 503 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const assetId = String(formData.get("assetId") || "").trim();
    const frame = formData.get("frame");

    if (!assetId || !(frame instanceof Blob) || frame.size === 0) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (frame.size > MAX_FRAME_BYTES) {
      return NextResponse.json({ error: "Frame is too large." }, { status: 413 });
    }
    if (!(frame.type || "").startsWith("image/")) {
      return NextResponse.json({ error: "Frame must be an image." }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Admin client unavailable." }, { status: 500 });
    }

    const { data: asset } = await admin
      .from("media_assets")
      .select("id, gallery_id, media_type, metadata_json")
      .eq("id", assetId)
      .maybeSingle();

    if (!asset) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    }
    if (asset.media_type !== "video") {
      return NextResponse.json({ error: "Thumbnails can only be set on videos." }, { status: 400 });
    }

    const poster = Buffer.from(await frame.arrayBuffer());

    const galleryId = String(asset.gallery_id);
    // A fresh key per capture: poster URLs are cached as immutable, so
    // replacing the frame must produce a new URL.
    const posterPath = `${galleryId}/posters/${assetId}-${randomUUID().slice(0, 8)}.jpg`;

    await uploadMediaToStorage(
      posterPath,
      new File([new Uint8Array(poster)], "poster.jpg", { type: frame.type || "image/jpeg" }),
    );

    const previousMetadata =
      (asset.metadata_json as Record<string, unknown> | null) || {};
    const previousPosterPath =
      typeof previousMetadata.thumbnail_path === "string" ? previousMetadata.thumbnail_path : null;

    const { error: updateError } = await admin
      .from("media_assets")
      .update({ metadata_json: { ...previousMetadata, thumbnail_path: posterPath } })
      .eq("id", assetId);

    if (updateError) {
      await deleteStoredObjects([posterPath]).catch(() => {});
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (previousPosterPath && previousPosterPath !== posterPath) {
      await deleteStoredObjects([previousPosterPath]).catch(() => {});
    }

    const { data: galleryRow } = await admin
      .from("galleries")
      .select("slug")
      .eq("id", galleryId)
      .maybeSingle();

    revalidatePath(`/admin/galleries/${galleryId}`);
    if (galleryRow?.slug) {
      revalidatePath(`/g/${galleryRow.slug}`);
    }

    // The poster is served directly from storage (public R2 URL or signed
    // URL) — not through /api/media/thumb, which depends on sharp.
    const thumbUrl = await getSignedMediaUrl(posterPath).catch(() => null);

    return NextResponse.json({
      thumbnailPath: posterPath,
      thumbUrl,
    });
  } catch (error) {
    console.error("video-thumbnail route failed", error);
    return NextResponse.json({ error: "Could not save thumbnail." }, { status: 500 });
  }
}
