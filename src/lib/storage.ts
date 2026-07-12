import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------
// Use Cloudflare R2 when all three R2 env vars are present; otherwise fall
// back to Supabase Storage so local dev keeps working without R2 credentials.

const R2_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "wedding-media";
// Optional public base URL (e.g. https://media.sixstoriesstudio.com).
// If set, public files are served directly without a signed URL.
const R2_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "";

const useR2 = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

// ---------------------------------------------------------------------------
// R2 client (lazy singleton)
// ---------------------------------------------------------------------------
let _r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!_r2Client) {
    _r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _r2Client;
}

// ---------------------------------------------------------------------------
// Supabase fallback bucket name
// ---------------------------------------------------------------------------
const SUPABASE_BUCKET = "wedding-media";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** No-op for R2 — buckets are created in the Cloudflare dashboard. */
export async function ensureMediaBucket() {
  if (useR2) return;

  const admin = createAdminClient();
  if (!admin) return;

  const { data: buckets } = await admin.storage.listBuckets();
  const exists = (buckets ?? []).some((b) => b.id === SUPABASE_BUCKET);
  if (exists) return;

  const { error } = await admin.storage.createBucket(SUPABASE_BUCKET, {
    public: false,
    fileSizeLimit: "200MB",
  });
  if (error) throw new Error(error.message);
}

export async function uploadMediaToStorage(path: string, file: File) {
  if (useR2) {
    const arrayBuffer = await file.arrayBuffer();
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: path,
        Body: Buffer.from(arrayBuffer),
        ContentType: file.type,
        CacheControl: "max-age=3600",
      }),
    );
    return { path };
  }

  const admin = createAdminClient();
  if (!admin) return { path };

  const { error } = await admin.storage.from(SUPABASE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(error.message);

  return { path };
}

export type SignedUploadTarget =
  | { provider: "r2"; url: string; path: string }
  | { provider: "supabase"; bucket: string; path: string; token: string };

/**
 * Creates a signed target the browser can upload to directly, bypassing the
 * serverless request-body size limit. Used for large files such as videos.
 */
export async function createSignedUploadTarget(
  path: string,
  contentType: string,
): Promise<SignedUploadTarget> {
  if (useR2) {
    const url = await getSignedUrl(
      getR2Client(),
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: path, ContentType: contentType }),
      { expiresIn: 60 * 15 },
    );
    return { provider: "r2", url, path };
  }

  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Storage unavailable");
  }

  const { data, error } = await admin.storage.from(SUPABASE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(error?.message ?? "Could not create signed upload URL");
  }

  return { provider: "supabase", bucket: SUPABASE_BUCKET, path: data.path, token: data.token };
}

export async function getSignedMediaUrl(storagePath: string, expiresIn = 60 * 60) {
  // External / demo URLs pass straight through.
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return storagePath;
  }

  if (useR2) {
    // If a public URL is configured, serve directly — no signing needed.
    if (R2_PUBLIC_URL) {
      return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${storagePath}`;
    }
    return getSignedUrl(
      getR2Client(),
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: storagePath }),
      { expiresIn },
    );
  }

  const admin = createAdminClient();
  if (!admin) return storagePath;

  const { data, error } = await admin.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not sign media URL");
  }
  return data.signedUrl;
}

/** Returns the active bucket name used when storing metadata in the DB. */
export function getBucketName() {
  return useR2 ? R2_BUCKET : SUPABASE_BUCKET;
}