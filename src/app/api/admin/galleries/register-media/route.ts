import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudioUser } from "@/lib/auth";
import {
  getBucketName,
  getStorageProviderName,
  mediaThumbKey,
  setMediaObjectsCacheControl,
} from "@/lib/storage";

export const runtime = "nodejs";

type RegisterItem = {
  storagePath?: string;
  originalName?: string;
  contentType?: string;
  width?: number;
  height?: number;
};

const MAX_BATCH = 100;

// Records uploaded objects as media assets. Accepts a single item (fields at
// the top level) or a batch (`items: [...]`), which is inserted in one
// statement with consecutive sort orders in the order given — the uploader
// sends batches in selection order, so galleries keep the photographer's
// sequence even though files upload in parallel.
export async function POST(request: Request) {
  try {
    if (!hasSupabaseEnv) {
      return NextResponse.json({ error: "Supabase env vars are missing." }, { status: 503 });
    }

    // A Supabase session alone is not enough: only studio members may use the
    // admin API.
    if (!(await getStudioUser())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | (RegisterItem & { galleryId?: string; sectionId?: string; items?: RegisterItem[] })
      | null;

    const galleryId = String(body?.galleryId || "").trim();
    const sectionId = String(body?.sectionId || "").trim();
    const rawItems: RegisterItem[] = Array.isArray(body?.items) ? body!.items! : [body ?? {}];
    const items = rawItems.map((item) => ({
      storagePath: String(item?.storagePath || "").trim(),
      originalName: String(item?.originalName || "").trim(),
      contentType: String(item?.contentType || "").trim(),
      width: Number(item?.width),
      height: Number(item?.height),
    }));

    if (
      !galleryId ||
      items.length === 0 ||
      items.length > MAX_BATCH ||
      items.some((item) => !item.storagePath)
    ) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Admin client unavailable." }, { status: 500 });
    }

    const { data: latestAsset } = await admin
      .from("media_assets")
      .select("sort_order")
      .eq("gallery_id", galleryId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const baseSortOrder = latestAsset?.sort_order || 0;
    const provider = getStorageProviderName();
    const bucket = getBucketName();

    const { error } = await admin.from("media_assets").insert(
      items.map((item, index) => ({
        gallery_id: galleryId,
        section_id: sectionId || null,
        storage_provider: provider,
        storage_bucket: bucket,
        storage_path: item.storagePath,
        original_name: item.originalName || null,
        media_type: item.contentType.startsWith("video/") ? "video" : "photo",
        width: Number.isFinite(item.width) && item.width > 0 ? Math.round(item.width) : null,
        height: Number.isFinite(item.height) && item.height > 0 ? Math.round(item.height) : null,
        sort_order: baseSortOrder + index + 1,
        is_cover: false,
      })),
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Browser uploads arrive without cache metadata; stamp the immutable
    // Cache-Control onto the original and its previews so browsers and the
    // CDN keep them. The content types are known here, which saves a HEAD
    // per object.
    await setMediaObjectsCacheControl(
      items.flatMap((item) => {
        const original = {
          key: item.storagePath,
          contentType: item.contentType || "application/octet-stream",
        };
        if (item.contentType.startsWith("video/")) return [original];
        return [
          original,
          { key: mediaThumbKey(item.storagePath, "lg"), contentType: "image/webp" },
          { key: mediaThumbKey(item.storagePath, "sm"), contentType: "image/webp" },
        ];
      }),
    );

    revalidatePath(`/admin/galleries/${galleryId}`);
    revalidatePath(`/g`);

    return NextResponse.json({ ok: true, count: items.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not register media.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
