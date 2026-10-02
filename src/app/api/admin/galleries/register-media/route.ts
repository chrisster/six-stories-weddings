import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudioUser } from "@/lib/auth";
import {
  deleteStoredObjects,
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
  /** Byte size of the original, kept so later uploads can spot duplicates. */
  size?: number;
  /** Existing asset this upload replaces in place (same gallery only). */
  replaceId?: string;
};

const MAX_BATCH = 100;

// Records uploaded objects as media assets. Accepts a single item (fields at
// the top level) or a batch (`items: [...]`), which is inserted in one
// statement with consecutive sort orders in the order given — the uploader
// sends batches in selection order, so galleries keep the photographer's
// sequence even though files upload in parallel.
//
// Items with `replaceId` swap the file behind an existing asset instead: the
// row keeps its id, position, section, cover flag, favorites and comments,
// and the replaced objects are deleted from storage once nothing references
// them.
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
      size: Number(item?.size),
      replaceId: String(item?.replaceId || "").trim(),
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

    const replaceIds = items.map((item) => item.replaceId).filter(Boolean);
    const replaced = new Map<string, { storage_path: string; metadata_json: unknown }>();
    if (replaceIds.length > 0) {
      const { data, error } = await admin
        .from("media_assets")
        .select("id, storage_path, metadata_json")
        .eq("gallery_id", galleryId)
        .in("id", replaceIds);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      for (const row of data || []) replaced.set(row.id as string, row);
    }

    const provider = getStorageProviderName();
    const bucket = getBucketName();
    const dimension = (value: number) => (Number.isFinite(value) && value > 0 ? Math.round(value) : null);
    const sizeOf = (item: (typeof items)[number]) =>
      Number.isFinite(item.size) && item.size > 0 ? Math.round(item.size) : null;

    // A replace target that was deleted meanwhile is simply added as new.
    const replacements = items.filter((item) => item.replaceId && replaced.has(item.replaceId));
    const inserts = items.filter((item) => !(item.replaceId && replaced.has(item.replaceId)));

    // Replacements run first: they are idempotent, so if the insert below
    // fails and the uploader retries the batch, nothing is applied twice.
    if (replacements.length > 0) {
      const results = await Promise.all(
        replacements.map((item) => {
          const previous = replaced.get(item.replaceId)!;
          const metadata = (previous.metadata_json as Record<string, unknown> | null) || {};
          const size = sizeOf(item);
          return admin
            .from("media_assets")
            .update({
              storage_provider: provider,
              storage_bucket: bucket,
              storage_path: item.storagePath,
              original_name: item.originalName || null,
              width: dimension(item.width),
              height: dimension(item.height),
              metadata_json: size ? { ...metadata, size } : metadata,
            })
            .eq("id", item.replaceId)
            .eq("gallery_id", galleryId);
        }),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        return NextResponse.json({ error: failed.error.message }, { status: 500 });
      }

      // Drop the old files unless another asset still points at them.
      const oldPaths = replacements.map((item) => replaced.get(item.replaceId)!.storage_path);
      const { data: stillUsed } = await admin
        .from("media_assets")
        .select("storage_path")
        .in("storage_path", oldPaths);
      const inUse = new Set((stillUsed || []).map((row) => row.storage_path as string));
      await deleteStoredObjects(oldPaths.filter((path) => !inUse.has(path))).catch(() => null);
    }

    if (inserts.length > 0) {
      const { data: latestAsset } = await admin
        .from("media_assets")
        .select("sort_order")
        .eq("gallery_id", galleryId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const baseSortOrder = latestAsset?.sort_order || 0;

      const { error } = await admin.from("media_assets").insert(
        inserts.map((item, index) => {
          const size = sizeOf(item);
          return {
            gallery_id: galleryId,
            section_id: sectionId || null,
            storage_provider: provider,
            storage_bucket: bucket,
            storage_path: item.storagePath,
            original_name: item.originalName || null,
            media_type: item.contentType.startsWith("video/") ? "video" : "photo",
            width: dimension(item.width),
            height: dimension(item.height),
            sort_order: baseSortOrder + index + 1,
            is_cover: false,
            metadata_json: size ? { size } : null,
          };
        }),
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
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

    return NextResponse.json({ ok: true, added: inserts.length, replaced: replacements.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not register media.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
