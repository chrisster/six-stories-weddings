import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { getStudioUser } from "@/lib/auth";
import { createSignedUploadTarget, ensureMediaBucket, mediaThumbKey } from "@/lib/storage";

export const runtime = "nodejs";

// Issues signed upload targets so the browser sends media bytes straight to
// storage — they never pass through a function body (Vercel request-body
// limits, Fast Origin Transfer). With `withThumb`, two more targets are
// issued for the derived previews (`thumbs/<path>.webp` at 1600px and
// `thumbs/sm/<path>.webp` at 480px) so the client can upload the downscaled
// webp images it generated alongside the original.
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

    const body = (await request.json().catch(() => null)) as {
      galleryId?: string;
      fileName?: string;
      contentType?: string;
      withThumb?: boolean;
    } | null;

    const galleryId = String(body?.galleryId || "").trim();
    const fileName = String(body?.fileName || "").trim();
    const contentType = String(body?.contentType || "application/octet-stream").trim();

    if (!galleryId || !fileName) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    await ensureMediaBucket();

    const extension = fileName.split(".").pop() || "bin";
    const storagePath = `${galleryId}/${randomUUID()}.${extension}`;

    const [target, thumbTarget, smallThumbTarget] = await Promise.all([
      createSignedUploadTarget(storagePath, contentType),
      body?.withThumb ? createSignedUploadTarget(mediaThumbKey(storagePath, "lg"), "image/webp") : null,
      body?.withThumb ? createSignedUploadTarget(mediaThumbKey(storagePath, "sm"), "image/webp") : null,
    ]);

    return NextResponse.json({ storagePath, target, thumbTarget, smallThumbTarget });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create upload URL.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
