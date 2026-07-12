import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSignedUploadTarget, ensureMediaBucket } from "@/lib/storage";

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
      fileName?: string;
      contentType?: string;
    } | null;

    const galleryId = String(body?.galleryId || "").trim();
    const fileName = String(body?.fileName || "").trim();
    const contentType = String(body?.contentType || "application/octet-stream").trim();

    if (!galleryId || !fileName) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    await ensureMediaBucket();

    const extension = fileName.split(".").pop() || "mp4";
    const storagePath = `${galleryId}/${randomUUID()}.${extension}`;

    const target = await createSignedUploadTarget(storagePath, contentType);

    return NextResponse.json({ storagePath, target });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create upload URL.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
