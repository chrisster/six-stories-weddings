import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------
// Use Cloudflare R2 when all three R2 env vars are present; otherwise fall
// back to Supabase Storage so local dev keeps working without R2 credentials.
//
// Two storage domains with different privacy models:
// - MEDIA (gallery photos/videos/posters/hero images, and the derived
//   thumbnails and ZIP archives): R2 when configured. With
//   CLOUDFLARE_R2_PUBLIC_URL set, the bucket is exposed through a public
//   custom domain and files are served straight from Cloudflare's CDN —
//   access control relies on unguessable UUID object keys, the same model the
//   thumbnail route always used. This keeps media bytes off Vercel functions
//   entirely (Fast Origin Transfer was being exhausted by proxied media).
// - DOCUMENTS (contract PDFs): always the private Supabase bucket, reachable
//   only through short-lived signed URLs. They must never be served from the
//   public media domain, so the document functions below deliberately ignore
//   the R2 configuration.

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

function publicMediaUrl(storagePath: string): string {
  return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${storagePath}`;
}

// ---------------------------------------------------------------------------
// Supabase fallback bucket name
// ---------------------------------------------------------------------------
const SUPABASE_BUCKET = "wedding-media";

// ---------------------------------------------------------------------------
// Public API — media
// ---------------------------------------------------------------------------

/** Whether Cloudflare R2 is the active media storage provider. */
export function isR2Enabled() {
  return useR2;
}

/**
 * Whether media is served straight from the public R2 custom domain. When
 * false, media URLs fall back to signed URLs and the same-origin proxy routes.
 */
export function isR2PublicEnabled() {
  return useR2 && Boolean(R2_PUBLIC_URL);
}

/** Provider string recorded on media_assets rows. */
export function getStorageProviderName() {
  return useR2 ? "r2" : "supabase";
}

/**
 * Storage key of the pre-generated web preview for a photo. Thumbnails live
 * under a parallel `thumbs/` prefix (webp, ≤1600px wide) so the original key
 * namespace stays clean. The key is derived by convention — no DB column —
 * and consumers must fall back to `/api/media/thumb` when the object is
 * missing (e.g. formats the uploading browser could not decode).
 */
export function mediaThumbKey(storagePath: string): string {
  return `thumbs/${storagePath}.webp`;
}

/** No-op for R2 — buckets are created in the Cloudflare dashboard. */
export async function ensureMediaBucket() {
  if (useR2) return;
  await ensureSupabaseBucket();
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

  await supabaseUpload(SUPABASE_BUCKET, path, file);
  return { path };
}

export type SignedUploadTarget =
  | { provider: "r2"; url: string; path: string }
  | { provider: "supabase"; bucket: string; path: string; token: string };

/**
 * Creates a signed target the browser can upload to directly, bypassing the
 * serverless request-body size limit and keeping upload bytes off Vercel's
 * Fast Origin Transfer. Used for photos and videos alike.
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
      return publicMediaUrl(storagePath);
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

/**
 * Returns a URL that downloads the object as an attachment with the given
 * filename. Unlike the public media URL this is always a signed URL, because
 * the attachment Content-Disposition is carried as a signed response override
 * (public custom domains ignore response-* query params). Used by the
 * download routes so files reach the browser straight from storage instead of
 * being proxied through a function.
 */
export async function getMediaDownloadUrl(
  storagePath: string,
  fileName: string,
  expiresIn = 60 * 60,
): Promise<string> {
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return storagePath;
  }

  const safeName = fileName.replace(/["\\\r\n]/g, "").trim() || "download";

  if (useR2) {
    return getSignedUrl(
      getR2Client(),
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: storagePath,
        ResponseContentDisposition: `attachment; filename="${safeName}"`,
      }),
      { expiresIn },
    );
  }

  const admin = createAdminClient();
  if (!admin) return storagePath;

  const { data, error } = await admin.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(storagePath, expiresIn, { download: safeName });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not sign download URL");
  }
  return data.signedUrl;
}

export type ThumbOptions = { width?: number; quality?: number };

/**
 * Returns a resized preview URL for grid/thumbnail rendering so browsers don't
 * download full-resolution photos just to show a small tile.
 *
 * With the public R2 domain configured this points at the pre-generated
 * `thumbs/<path>.webp` object (uploaded by the browser at upload time, or by
 * the migration script for older assets) and costs no Vercel compute or
 * transfer. Otherwise it falls back to the on-demand `/api/media/thumb`
 * sharp route. External (demo) URLs pass through unchanged.
 */
export function getMediaThumbUrl(
  storagePath: string,
  { width = 640, quality = 72 }: ThumbOptions = {},
): string {
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return storagePath;
  }

  if (isR2PublicEnabled()) {
    return publicMediaUrl(mediaThumbKey(storagePath));
  }

  const params = new URLSearchParams({
    path: storagePath,
    w: String(Math.round(width)),
    q: String(Math.round(quality)),
  });
  return `/api/media/thumb?${params.toString()}`;
}

/**
 * URL a client should retry when the stored thumbnail object is missing —
 * the on-demand sharp route. Only meaningful when the primary thumb URL is
 * the pre-generated object; returns null when getMediaThumbUrl already points
 * at the sharp route (or the asset is an external URL).
 */
export function getMediaThumbFallbackUrl(
  storagePath: string,
  { width = 640, quality = 72 }: ThumbOptions = {},
): string | null {
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return null;
  }
  if (!isR2PublicEnabled()) {
    return null;
  }
  const params = new URLSearchParams({
    path: storagePath,
    w: String(Math.round(width)),
    q: String(Math.round(quality)),
  });
  return `/api/media/thumb?${params.toString()}`;
}

/**
 * Returns a URL for playing a stored video in a browser `<video>` element.
 *
 * When a public R2 URL is configured (`CLOUDFLARE_R2_PUBLIC_URL`), the video is
 * served straight from R2's CDN so multi-GB films don't stream through the
 * serverless function. Otherwise it falls back to the same-origin
 * `/api/media/video` proxy (which supports HTTP Range). Presigned R2 URLs are
 * not reliably playable directly, so we never hand those to `<video>`. External
 * (demo) URLs pass through unchanged.
 */
export function getMediaStreamUrl(storagePath: string): string {
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return storagePath;
  }

  if (useR2 && R2_PUBLIC_URL) {
    return publicMediaUrl(storagePath);
  }

  const params = new URLSearchParams({ path: storagePath });
  return `/api/media/video?${params.toString()}`;
}

/**
 * Downloads the raw bytes of a stored object. Used server-side by the thumbnail
 * route to resize originals. Returns null when the object cannot be read.
 */
export async function getMediaBytes(
  storagePath: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return null;
  }

  if (useR2) {
    const result = await getR2Client().send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: storagePath }),
    );
    if (!result.Body) return null;
    const bytes = await result.Body.transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: result.ContentType || "application/octet-stream",
    };
  }

  return supabaseDownload(SUPABASE_BUCKET, storagePath);
}

/** Whether a media object exists. R2 only — always false on Supabase. */
export async function headMediaObject(storagePath: string): Promise<boolean> {
  if (!useR2) return false;
  try {
    await getR2Client().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: storagePath }));
    return true;
  } catch {
    return false;
  }
}

/** Lists media object keys under a prefix. R2 only — empty on Supabase. */
export async function listMediaObjectKeys(prefix: string): Promise<string[]> {
  if (!useR2) return [];
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const result = await getR2Client().send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const item of result.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

/**
 * Streams an object of unknown length into R2 via multipart upload. Used by
 * the gallery ZIP builder: the archive is assembled once inside R2 and then
 * served from the public domain, so the bytes never flow through a function
 * response. Parts are buffered to ~8 MiB (S3 requires ≥5 MiB per non-final
 * part), which also provides natural backpressure on the producer.
 */
export async function storeMediaObjectStream(
  path: string,
  { contentType, contentDisposition }: { contentType: string; contentDisposition?: string },
  chunks: AsyncIterable<Uint8Array>,
): Promise<void> {
  if (!useR2) {
    throw new Error("Streaming media upload requires R2 storage.");
  }

  const client = getR2Client();
  const created = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: path,
      ContentType: contentType,
      ContentDisposition: contentDisposition,
    }),
  );
  const uploadId = created.UploadId;
  if (!uploadId) {
    throw new Error("Could not start streaming upload.");
  }

  const PART_SIZE = 8 * 1024 * 1024;
  const parts: Array<{ PartNumber: number; ETag: string }> = [];
  let buffered: Uint8Array[] = [];
  let bufferedBytes = 0;

  const flushPart = async () => {
    if (bufferedBytes === 0 && parts.length > 0) return;
    const partNumber = parts.length + 1;
    const body = Buffer.concat(buffered, bufferedBytes);
    buffered = [];
    bufferedBytes = 0;
    const result = await client.send(
      new UploadPartCommand({
        Bucket: R2_BUCKET,
        Key: path,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
      }),
    );
    if (!result.ETag) {
      throw new Error("Storage did not return a part ETag.");
    }
    parts.push({ PartNumber: partNumber, ETag: result.ETag });
  };

  try {
    for await (const chunk of chunks) {
      if (chunk.length === 0) continue;
      buffered.push(chunk);
      bufferedBytes += chunk.length;
      if (bufferedBytes >= PART_SIZE) {
        await flushPart();
      }
    }
    await flushPart();

    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: R2_BUCKET,
        Key: path,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  } catch (error) {
    await client
      .send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: path, UploadId: uploadId }))
      .catch(() => null);
    throw error;
  }
}

/**
 * Permanently removes media objects from the active storage provider. Each
 * photo's derived `thumbs/` object is removed alongside it; deleting a key
 * that does not exist is a no-op on both providers.
 */
export async function deleteStoredObjects(storagePaths: string[]): Promise<void> {
  const primary = storagePaths.filter((path) => path && !path.includes("://"));
  if (primary.length === 0) return;

  const paths = [
    ...primary,
    ...primary
      .filter((path) => !path.startsWith("thumbs/") && !path.startsWith("zips/"))
      .map(mediaThumbKey),
  ];

  if (useR2) {
    // DeleteObjects caps at 1000 keys per request.
    for (let i = 0; i < paths.length; i += 1000) {
      const batch = paths.slice(i, i + 1000);
      await getR2Client().send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
    return;
  }

  const admin = createAdminClient();
  if (!admin) return;

  const { error } = await admin.storage.from(SUPABASE_BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}

/** Returns the active bucket name used when storing metadata in the DB. */
export function getBucketName() {
  return useR2 ? R2_BUCKET : SUPABASE_BUCKET;
}

// ---------------------------------------------------------------------------
// Multipart upload (R2 only)
// ---------------------------------------------------------------------------
// Single presigned PUT uploads are capped at 5 GiB by S3/R2 and the signed URL
// must live long enough to transfer the whole file. Multi-GB videos therefore
// use multipart upload: the object is split into parts that are each uploaded
// with their own short-lived signed URL, then stitched together on completion.

/** Starts a multipart upload and returns its upload id. */
export async function createMultipartUpload(
  path: string,
  contentType: string,
): Promise<{ uploadId: string }> {
  if (!useR2) {
    throw new Error("Multipart upload requires R2 storage.");
  }

  const result = await getR2Client().send(
    new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: path,
      ContentType: contentType,
    }),
  );

  if (!result.UploadId) {
    throw new Error("Could not start multipart upload.");
  }

  return { uploadId: result.UploadId };
}

/** Returns a short-lived signed URL the browser can PUT a single part to. */
export async function signMultipartPart(
  path: string,
  uploadId: string,
  partNumber: number,
): Promise<string> {
  if (!useR2) {
    throw new Error("Multipart upload requires R2 storage.");
  }

  return getSignedUrl(
    getR2Client(),
    new UploadPartCommand({
      Bucket: R2_BUCKET,
      Key: path,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: 60 * 60 },
  );
}

/** Finalizes a multipart upload from the collected part ETags. */
export async function completeMultipartUpload(
  path: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>,
): Promise<void> {
  if (!useR2) {
    throw new Error("Multipart upload requires R2 storage.");
  }

  await getR2Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: path,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    }),
  );
}

/** Cancels a multipart upload and discards any uploaded parts. */
export async function abortMultipartUpload(path: string, uploadId: string): Promise<void> {
  if (!useR2) return;

  await getR2Client()
    .send(
      new AbortMultipartUploadCommand({
        Bucket: R2_BUCKET,
        Key: path,
        UploadId: uploadId,
      }),
    )
    .catch(() => null);
}

// ---------------------------------------------------------------------------
// Public API — documents (contract PDFs)
// ---------------------------------------------------------------------------
// Documents are pinned to the private Supabase bucket regardless of the R2
// configuration: they contain personal data and must never be reachable
// through the public media domain. Access is only ever via short-lived signed
// URLs or server-side reads.

export async function ensureDocumentBucket() {
  await ensureSupabaseBucket();
}

export async function uploadDocumentToStorage(path: string, file: File) {
  await supabaseUpload(SUPABASE_BUCKET, path, file);
  return { path };
}

export async function getSignedDocumentUrl(storagePath: string, expiresIn = 60 * 60) {
  const admin = createAdminClient();
  if (!admin) return storagePath;

  const { data, error } = await admin.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not sign document URL");
  }
  return data.signedUrl;
}

export async function getDocumentBytes(
  storagePath: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  return supabaseDownload(SUPABASE_BUCKET, storagePath);
}

export async function deleteStoredDocuments(storagePaths: string[]): Promise<void> {
  const paths = storagePaths.filter((path) => path && !path.includes("://"));
  if (paths.length === 0) return;

  const admin = createAdminClient();
  if (!admin) return;

  const { error } = await admin.storage.from(SUPABASE_BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Supabase helpers shared by the media fallback and the document store
// ---------------------------------------------------------------------------

async function ensureSupabaseBucket() {
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

async function supabaseUpload(bucket: string, path: string, file: File) {
  const admin = createAdminClient();
  if (!admin) return;

  const { error } = await admin.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(error.message);
}

async function supabaseDownload(
  bucket: string,
  storagePath: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return null;
  }

  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin.storage.from(bucket).download(storagePath);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return {
    body: Buffer.from(arrayBuffer),
    contentType: data.type || "application/octet-stream",
  };
}
