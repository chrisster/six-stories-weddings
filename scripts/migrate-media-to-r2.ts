/**
 * One-off migration of gallery media from Supabase Storage to Cloudflare R2.
 *
 * Copies every media object referenced by the database (media_assets originals,
 * video poster frames, gallery hero images) from the Supabase bucket into R2,
 * generates the `thumbs/<path>.webp` web preview for every photo with local
 * sharp (so the deployed app never has to resize anything), and finally stamps
 * media_assets rows with storage_provider='r2'.
 *
 * Contract PDFs are deliberately NOT migrated — they stay in the private
 * Supabase bucket (see src/lib/storage.ts, document functions).
 *
 * The script is idempotent: objects already present in R2 are skipped, so it
 * can be re-run after a partial failure. Run it BEFORE setting the R2 env vars
 * on Vercel — until every object is copied, flipping the app to R2 would 404.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/migrate-media-to-r2.ts [--dry-run]
 *     [--verify] [--delete-source] [--concurrency=4]
 *
 * Requires in the environment (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID,
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME (optional)
 */

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "wedding-media";

const SUPABASE_BUCKET = "wedding-media";
const THUMB_WIDTH = 1600;
const THUMB_QUALITY = 72;
const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
const MULTIPART_PART_SIZE = 64 * 1024 * 1024;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
}
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  throw new Error(
    "Missing CLOUDFLARE_R2_ACCOUNT_ID / CLOUDFLARE_R2_ACCESS_KEY_ID / CLOUDFLARE_R2_SECRET_ACCESS_KEY in environment.",
  );
}
if (!process.env.CLOUDFLARE_R2_PUBLIC_URL) {
  console.warn(
    "⚠ CLOUDFLARE_R2_PUBLIC_URL is not set — remember to configure the public custom domain " +
      "and set it (here and on Vercel) before flipping the app to R2.",
  );
}

const dryRun = process.argv.includes("--dry-run");
const verifyOnly = process.argv.includes("--verify");
const deleteSource = process.argv.includes("--delete-source");
const concurrency = Math.max(
  1,
  Number((process.argv.find((a) => a.startsWith("--concurrency=")) || "").split("=")[1] || 4),
);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

type Item = {
  path: string;
  kind: "photo" | "video" | "poster" | "hero";
  assetIds: string[];
};

const isExternal = (path: string) => path.startsWith("http://") || path.startsWith("https://");
const thumbKey = (path: string) => `thumbs/${path}.webp`;

async function collectItems(): Promise<Item[]> {
  const byPath = new Map<string, Item>();
  const add = (path: string | null | undefined, kind: Item["kind"], assetId?: string) => {
    if (!path || isExternal(path)) return;
    const existing = byPath.get(path);
    if (existing) {
      if (assetId) existing.assetIds.push(assetId);
      return;
    }
    byPath.set(path, { path, kind, assetIds: assetId ? [assetId] : [] });
  };

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("media_assets")
      .select("id, storage_path, media_type, metadata_json")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`media_assets query failed: ${error.message}`);
    for (const row of data ?? []) {
      add(row.storage_path, row.media_type === "video" ? "video" : "photo", row.id);
      const metadata = (row.metadata_json ?? {}) as Record<string, unknown>;
      if (typeof metadata.thumbnail_path === "string") {
        add(metadata.thumbnail_path, "poster");
      }
    }
    if (!data || data.length < PAGE) break;
  }

  const { data: galleries, error: galleriesError } = await supabase
    .from("galleries")
    .select("id, hero_image_path");
  if (galleriesError) throw new Error(`galleries query failed: ${galleriesError.message}`);
  for (const row of galleries ?? []) {
    add(row.hero_image_path, "hero");
  }

  return [...byPath.values()];
}

async function headR2(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function signedSourceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(`could not sign source URL: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

async function uploadBuffer(key: string, body: Buffer, contentType: string) {
  await r2.send(
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

async function uploadStream(
  key: string,
  contentType: string,
  reader: ReadableStreamDefaultReader<Uint8Array>,
) {
  const created = await r2.send(
    new CreateMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
  );
  const uploadId = created.UploadId;
  if (!uploadId) throw new Error("could not start multipart upload");

  const parts: Array<{ PartNumber: number; ETag: string }> = [];
  let buffered: Uint8Array[] = [];
  let bufferedBytes = 0;

  const flush = async (final: boolean) => {
    if (bufferedBytes === 0 && !final) return;
    if (bufferedBytes === 0 && parts.length > 0) return;
    const partNumber = parts.length + 1;
    const body = Buffer.concat(buffered, bufferedBytes);
    buffered = [];
    bufferedBytes = 0;
    const result = await r2.send(
      new UploadPartCommand({
        Bucket: R2_BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
      }),
    );
    if (!result.ETag) throw new Error("missing part ETag");
    parts.push({ PartNumber: partNumber, ETag: result.ETag });
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        buffered.push(value);
        bufferedBytes += value.length;
        if (bufferedBytes >= MULTIPART_PART_SIZE) await flush(false);
      }
    }
    await flush(true);
    await r2.send(
      new CompleteMultipartUploadCommand({
        Bucket: R2_BUCKET,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  } catch (error) {
    await r2
      .send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }))
      .catch(() => null);
    throw error;
  }
}

type Result = {
  item: Item;
  copied: boolean;
  thumbCreated: boolean;
  deleted: boolean;
  error?: string;
};

async function migrateItem(item: Item): Promise<Result> {
  const result: Result = { item, copied: false, thumbCreated: false, deleted: false };
  try {
    const exists = await headR2(item.path);
    const needsThumb = item.kind === "photo" && !(await headR2(thumbKey(item.path)));

    if (verifyOnly) {
      if (!exists) result.error = "missing in R2";
      else if (needsThumb) result.error = "thumb missing in R2";
      return result;
    }

    if (dryRun) {
      if (!exists) result.copied = true;
      if (needsThumb) result.thumbCreated = true;
      return result;
    }

    let buffer: Buffer | null = null;

    if (!exists || needsThumb) {
      const url = await signedSourceUrl(item.path);
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        throw new Error(`source fetch failed (${response.status})`);
      }
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const contentLength = Number(response.headers.get("content-length") || 0);

      if (!exists && contentLength > MULTIPART_THRESHOLD) {
        await uploadStream(item.path, contentType, response.body.getReader());
        result.copied = true;
        // Large objects are videos — no thumb needed, no buffer kept.
      } else {
        buffer = Buffer.from(await response.arrayBuffer());
        if (!exists) {
          await uploadBuffer(item.path, buffer, contentType);
          result.copied = true;
        }
      }
    }

    if (needsThumb && buffer) {
      try {
        const webp = await sharp(buffer, { failOn: "none" })
          .rotate()
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .webp({ quality: THUMB_QUALITY })
          .toBuffer();
        await uploadBuffer(thumbKey(item.path), webp, "image/webp");
        result.thumbCreated = true;
      } catch (thumbError) {
        // Non-fatal: the on-demand resize route remains the fallback.
        console.warn(
          `  ⚠ thumb failed for ${item.path}: ${
            thumbError instanceof Error ? thumbError.message : "unknown"
          }`,
        );
      }
    }

    if (deleteSource) {
      const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove([item.path]);
      if (error) throw new Error(`source delete failed: ${error.message}`);
      result.deleted = true;
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

async function main() {
  console.log(
    `${verifyOnly ? "Verifying" : dryRun ? "Dry-run of" : "Running"} media migration → R2 bucket "${R2_BUCKET}"` +
      (deleteSource ? " (deleting Supabase sources after copy)" : ""),
  );

  const items = await collectItems();
  console.log(`Found ${items.length} storage objects referenced by the database.`);

  const results: Result[] = [];
  let index = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (index < items.length) {
        const current = items[index++];
        const position = `[${index}/${items.length}]`;
        const result = await migrateItem(current);
        results.push(result);
        if (result.error) {
          console.error(`${position} ✗ ${current.kind} ${current.path}: ${result.error}`);
        } else {
          const actions = [
            result.copied ? "copied" : "exists",
            result.thumbCreated ? "+thumb" : "",
            result.deleted ? "-source" : "",
          ]
            .filter(Boolean)
            .join(" ");
          console.log(`${position} ✓ ${current.kind} ${current.path} (${actions})`);
        }
      }
    }),
  );

  const failures = results.filter((r) => r.error);
  const copied = results.filter((r) => r.copied).length;
  const thumbs = results.filter((r) => r.thumbCreated).length;

  if (!verifyOnly && !dryRun && failures.length === 0) {
    const assetIds = items.flatMap((item) => item.assetIds);
    for (let i = 0; i < assetIds.length; i += 500) {
      const batch = assetIds.slice(i, i + 500);
      const { error } = await supabase
        .from("media_assets")
        .update({ storage_provider: "r2", storage_bucket: R2_BUCKET })
        .in("id", batch);
      if (error) throw new Error(`media_assets update failed: ${error.message}`);
    }
    console.log(`Stamped ${assetIds.length} media_assets rows with storage_provider='r2'.`);
  } else if (!verifyOnly && !dryRun) {
    console.warn("DB rows NOT updated because some objects failed — fix and re-run.");
  }

  console.log(
    `\nDone: ${copied} copied, ${thumbs} thumbs created, ${
      results.length - failures.length
    } ok, ${failures.length} failed.`,
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
