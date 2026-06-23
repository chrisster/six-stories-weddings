import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureMediaBucket, getBucketName, uploadMediaToStorage } from "@/lib/storage";

export const runtime = "nodejs";

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

    const formData = await request.formData();
    const galleryId = String(formData.get("galleryId") || "").trim();
    const sectionId = String(formData.get("sectionId") || "").trim();
    const file = formData.get("file");

    if (!galleryId || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Admin client unavailable." }, { status: 500 });
    }

    await ensureMediaBucket();

    const { data: latestAsset } = await admin
      .from("media_assets")
      .select("sort_order")
      .eq("gallery_id", galleryId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const extension = file.name.split(".").pop() || "bin";
    const storagePath = `${galleryId}/${randomUUID()}.${extension}`;

    await uploadMediaToStorage(storagePath, file);

    const { error } = await admin.from("media_assets").insert({
      gallery_id: galleryId,
      section_id: sectionId || null,
      storage_provider: "supabase",
      storage_bucket: getBucketName(),
      storage_path: storagePath,
      media_type: file.type.startsWith("video/") ? "video" : "photo",
      sort_order: (latestAsset?.sort_order || 0) + 1,
      is_cover: false,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath(`/admin/galleries/${galleryId}`);
    revalidatePath(`/g`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
