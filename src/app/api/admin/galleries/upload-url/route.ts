import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { getStudioUser } from "@/lib/auth";
import { createSignedUploadTarget, ensureMediaBucket, mediaThumbKey } from "@/lib/storage";

export const runtime = "nodejs";

type FileRequest = { fileName?: string; contentType?: string; withThumb?: boolean };

// Presigning is local crypto on R2, so a whole batch costs one function call
// instead of one per photo.
const MAX_BATCH = 100;

// Issues signed upload targets so the browser sends media bytes straight to
// storage — they never pass through a function body (Vercel request-body
// limits, Fast Origin Transfer). With `withThumb`, two more targets are
// issued for the derived previews (`thumbs/<path>.webp` at 1600px and
// `thumbs/sm/<path>.webp` at 480px) so the client can upload the downscaled
// webp images it generated alongside the original.
//
// Accepts either a single file (`fileName`, `contentType`, `withThumb`) or a
// batch (`files: [...]`, answered with `items` in the same order).
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
      | (FileRequest & { galleryId?: string; files?: FileRequest[] })
      | null;

    const galleryId = String(body?.galleryId || "").trim();
    const isBatch = Array.isArray(body?.files);
    const files: FileRequest[] = isBatch ? body!.files! : [body ?? {}];

    if (!galleryId || files.length === 0 || files.length > MAX_BATCH) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (files.some((file) => !String(file?.fileName || "").trim())) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    await ensureMediaBucket();

    const items = await Promise.all(
      files.map(async (file) => {
        const fileName = String(file.fileName).trim();
        const contentType = String(file.contentType || "application/octet-stream").trim();
        const extension = fileName.split(".").pop() || "bin";
        const storagePath = `${galleryId}/${randomUUID()}.${extension}`;

        const [target, thumbTarget, smallThumbTarget] = await Promise.all([
          createSignedUploadTarget(storagePath, contentType),
          file.withThumb ? createSignedUploadTarget(mediaThumbKey(storagePath, "lg"), "image/webp") : null,
          file.withThumb ? createSignedUploadTarget(mediaThumbKey(storagePath, "sm"), "image/webp") : null,
        ]);

        return { storagePath, target, thumbTarget, smallThumbTarget };
      }),
    );

    return NextResponse.json(isBatch ? { items } : items[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create upload URL.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
