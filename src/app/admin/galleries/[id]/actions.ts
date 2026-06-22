"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBucketName, uploadMediaToStorage } from "@/lib/storage";

export async function createGallerySectionAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!galleryId || !name) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const { data: existing } = await admin
    .from("gallery_sections")
    .select("sort_order")
    .eq("gallery_id", galleryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (existing?.sort_order || 0) + 1;

  await admin.from("gallery_sections").insert({
    gallery_id: galleryId,
    name,
    sort_order: nextOrder,
  });

  revalidatePath(`/admin/galleries/${galleryId}`);
  revalidatePath(`/g`);
}

export async function updateGallerySettingsAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "");
  const isPublished = formData.get("isPublished") === "on";
  const allowDownloads = formData.get("allowDownloads") === "on";
  const passcode = String(formData.get("passcode") || "").trim();

  if (!galleryId) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const payload: Record<string, unknown> = {
    is_published: isPublished,
    allow_downloads: allowDownloads,
  };

  if (passcode.length > 0) {
    payload.passcode_hash = await bcrypt.hash(passcode, 10);
  }

  await admin.from("galleries").update(payload).eq("id", galleryId);

  revalidatePath(`/admin/galleries/${galleryId}`);
}

export async function uploadMediaAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "");
  const sectionId = String(formData.get("sectionId") || "");
  const file = formData.get("file");

  if (!galleryId || !(file instanceof File) || file.size === 0) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const extension = file.name.split(".").pop() || "bin";
  const storagePath = `${galleryId}/${randomUUID()}.${extension}`;
  await uploadMediaToStorage(storagePath, file);

  const { data: latestAsset } = await admin
    .from("media_assets")
    .select("sort_order")
    .eq("gallery_id", galleryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await admin.from("media_assets").insert({
    gallery_id: galleryId,
    section_id: sectionId || null,
    storage_provider: "supabase",
    storage_bucket: getBucketName(),
    storage_path: storagePath,
    media_type: file.type.startsWith("video/") ? "video" : "photo",
    sort_order: (latestAsset?.sort_order || 0) + 1,
    is_cover: false,
  });

  revalidatePath(`/admin/galleries/${galleryId}`);
}

export async function setCoverMediaAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "");
  const mediaId = String(formData.get("mediaId") || "");
  if (!galleryId || !mediaId) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  await admin.from("media_assets").update({ is_cover: false }).eq("gallery_id", galleryId);
  await admin.from("media_assets").update({ is_cover: true }).eq("id", mediaId);
  await admin.from("galleries").update({ cover_media_id: mediaId }).eq("id", galleryId);

  revalidatePath(`/admin/galleries/${galleryId}`);
}