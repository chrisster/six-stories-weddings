import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  ensureMediaBucket,
  isR2Enabled,
  signMultipartPart,
} from "@/lib/storage";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type MultipartBody = {
  action?: "create" | "sign-part" | "complete" | "abort";
  galleryId?: string;
  fileName?: string;
  contentType?: string;
  storagePath?: string;
  uploadId?: string;
  partNumber?: number;
  parts?: Array<{ partNumber?: number; etag?: string }>;
};

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

    if (!isR2Enabled()) {
      // The caller should fall back to the single signed-URL upload path.
      return NextResponse.json({ fallback: true }, { status: 409 });
    }

    const body = (await request.json().catch(() => null)) as MultipartBody | null;
    const action = body?.action;

    if (action === "create") {
      const galleryId = String(body?.galleryId || "").trim();
      const fileName = String(body?.fileName || "").trim();
      const contentType = String(body?.contentType || "video/mp4").trim();

      if (!galleryId || !fileName) {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      }

      await ensureMediaBucket();

      const extension = fileName.split(".").pop() || "mp4";
      const storagePath = `${galleryId}/${randomUUID()}.${extension}`;
      const { uploadId } = await createMultipartUpload(storagePath, contentType);

      return NextResponse.json({ storagePath, uploadId });
    }

    if (action === "sign-part") {
      const storagePath = String(body?.storagePath || "").trim();
      const uploadId = String(body?.uploadId || "").trim();
      const partNumber = Number(body?.partNumber);

      if (!storagePath || !uploadId || !Number.isInteger(partNumber) || partNumber < 1) {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      }

      const url = await signMultipartPart(storagePath, uploadId, partNumber);
      return NextResponse.json({ url });
    }

    if (action === "complete") {
      const storagePath = String(body?.storagePath || "").trim();
      const uploadId = String(body?.uploadId || "").trim();
      const parts = (body?.parts || [])
        .map((part) => ({
          partNumber: Number(part?.partNumber),
          etag: String(part?.etag || "").trim(),
        }))
        .filter((part) => Number.isInteger(part.partNumber) && part.partNumber >= 1 && part.etag);

      if (!storagePath || !uploadId || parts.length === 0) {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      }

      await completeMultipartUpload(storagePath, uploadId, parts);
      return NextResponse.json({ ok: true });
    }

    if (action === "abort") {
      const storagePath = String(body?.storagePath || "").trim();
      const uploadId = String(body?.uploadId || "").trim();

      if (!storagePath || !uploadId) {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      }

      await abortMultipartUpload(storagePath, uploadId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Multipart upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
