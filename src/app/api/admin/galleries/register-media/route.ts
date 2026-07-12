import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBucketName } from "@/lib/storage";

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

    const body = (await request.json().catch(() => null)) as {
      galleryId?: string;
      sectionId?: string;
      storagePath?: string;
      originalName?: string;
      contentType?: string;
    } | null;

    const galleryId = String(body?.galleryId || "").trim();
    const storagePath = String(body?.storagePath || "").trim();
    const originalName = String(body?.originalName || "").trim();
    const sectionId = String(body?.sectionId || "").trim();
    const contentType = String(body?.contentType || "").trim();

    if (!galleryId || !storagePath) {
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

    const { error } = await admin.from("media_assets").insert({
      gallery_id: galleryId,
      section_id: sectionId || null,
      storage_provider: "supabase",
      storage_bucket: getBucketName(),
      storage_path: storagePath,
      original_name: originalName || null,
      media_type: contentType.startsWith("video/") ? "video" : "photo",
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
    const message = error instanceof Error ? error.message : "Could not register media.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
