/**
 * Backfills what older uploads are missing so the galleries can be served
 * straight from storage with no server work:
 *
 *   1. thumbs/<key>.webp        1600px preview (only when absent)
 *   2. thumbs/sm/<key>.webp     480px preview for cards and phones
 *   3. media_assets.width/height  so grids can lay rows out before images load
 *   4. Cache-Control: public, max-age=31536000, immutable on originals,
 *      previews and video posters (browser-uploaded objects carry none)
 *
 * Idempotent: every step checks before it writes, so it can be re-run.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-media-derivatives.ts            # dry run
 *   npx tsx --env-file=.env.local scripts/backfill-media-derivatives.ts --run      # apply
 *   options: --concurrency=6  --limit=50  --gallery=<uuid>
 */
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { MEDIA_CACHE_CONTROL, THUMB_WIDTHS, mediaThumbKey } from "@/lib/storage";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  }),
);
const DRY_RUN = args.get("run") !== "true";
const CONCURRENCY = Number(args.get("concurrency") || 6);
const LIMIT = Number(args.get("limit") || 0);
const ONLY_GALLERY = args.get("gallery") || "";

const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "wedding-media";
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Row = {
  id: string;
  storage_path: string;
  media_type: "photo" | "video";
  width: number | null;
  height: number | null;
  metadata_json: Record<string, unknown> | null;
};

const stats = {
  photos: 0,
  videos: 0,
  lgCreated: 0,
  smCreated: 0,
  dimsSet: 0,
  cacheSet: 0,
  errors: 0,
};

async function head(Key: string) {
  try {
    return await r2.send(new HeadObjectCommand({ Bucket: bucket, Key }));
  } catch {
    return null;
  }
}

async function getBytes(Key: string, range?: string): Promise<Buffer | null> {
  try {
    const out = await r2.send(new GetObjectCommand({ Bucket: bucket, Key, Range: range }));
    if (!out.Body) return null;
    return Buffer.from(await out.Body.transformToByteArray());
  } catch {
    return null;
  }
}

async function put(Key: string, Body: Buffer, ContentType: string) {
  if (DRY_RUN) return;
  await r2.send(
    new PutObjectCommand({ Bucket: bucket, Key, Body, ContentType, CacheControl: MEDIA_CACHE_CONTROL }),
  );
}

/** Copies an object onto itself with replaced metadata; returns true when a write happened. */
async function stampCacheControl(Key: string, existing?: Awaited<ReturnType<typeof head>>) {
  const meta = existing === undefined ? await head(Key) : existing;
  if (!meta) return false;
  if (meta.CacheControl === MEDIA_CACHE_CONTROL) return false;
  if (!DRY_RUN) {
    await r2.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key,
        CopySource: `${bucket}/${encodeURIComponent(Key).replace(/%2F/g, "/")}`,
        MetadataDirective: "REPLACE",
        ContentType: meta.ContentType || "application/octet-stream",
        CacheControl: MEDIA_CACHE_CONTROL,
      }),
    );
  }
  stats.cacheSet += 1;
  return true;
}

/** Oriented pixel size from the first 64 KB of the original (JPEG SOF + EXIF), if readable. */
async function originalDimensions(key: string): Promise<{ width: number; height: number } | null> {
  const headerBytes = await getBytes(key, "bytes=0-65535");
  if (!headerBytes) return null;
  try {
    const meta = await sharp(headerBytes, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) return null;
    const rotated = (meta.orientation || 1) >= 5;
    return rotated ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

async function processPhoto(row: Row) {
  stats.photos += 1;
  const key = row.storage_path;
  const lgKey = mediaThumbKey(key, "lg");
  const smKey = mediaThumbKey(key, "sm");

  const [originalMeta, lgMeta, smMeta] = await Promise.all([head(key), head(lgKey), head(smKey)]);
  if (!originalMeta) {
    console.warn(`  missing original: ${key}`);
    stats.errors += 1;
    return;
  }

  let lgBuffer: Buffer | null = null;

  if (!lgMeta) {
    const original = await getBytes(key);
    if (!original) {
      stats.errors += 1;
      return;
    }
    lgBuffer = await sharp(original, { failOn: "none" })
      .rotate()
      .resize({ width: THUMB_WIDTHS.lg, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    await put(lgKey, lgBuffer, "image/webp");
    stats.lgCreated += 1;
  } else {
    await stampCacheControl(lgKey, lgMeta);
  }

  if (!smMeta) {
    lgBuffer = lgBuffer || (await getBytes(lgKey));
    if (lgBuffer) {
      const small = await sharp(lgBuffer, { failOn: "none" })
        .resize({ width: THUMB_WIDTHS.sm, withoutEnlargement: true })
        .webp({ quality: 70 })
        .toBuffer();
      await put(smKey, small, "image/webp");
      stats.smCreated += 1;
    }
  } else {
    await stampCacheControl(smKey, smMeta);
  }

  await stampCacheControl(key, originalMeta);

  if (!row.width || !row.height) {
    let dims = await originalDimensions(key);
    if (!dims) {
      lgBuffer = lgBuffer || (await getBytes(lgKey));
      if (lgBuffer) {
        const meta = await sharp(lgBuffer).metadata();
        if (meta.width && meta.height) dims = { width: meta.width, height: meta.height };
      }
    }
    if (dims) {
      if (!DRY_RUN) {
        const { error } = await db.from("media_assets").update(dims).eq("id", row.id);
        if (error) {
          console.warn(`  dims update failed for ${row.id}: ${error.message}`);
          stats.errors += 1;
          return;
        }
      }
      stats.dimsSet += 1;
    }
  }
}

async function processVideo(row: Row) {
  stats.videos += 1;
  await stampCacheControl(row.storage_path);
  const poster = row.metadata_json && typeof row.metadata_json.thumbnail_path === "string"
    ? row.metadata_json.thumbnail_path
    : null;
  if (poster && !poster.includes("://")) {
    await stampCacheControl(poster);
  }
}

async function loadRows(): Promise<Row[]> {
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let query = db
      .from("media_assets")
      .select("id, storage_path, media_type, width, height, metadata_json")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (ONLY_GALLERY) query = query.eq("gallery_id", ONLY_GALLERY);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }
  return rows.filter((row) => !row.storage_path.includes("://"));
}

async function main() {
  console.log(`${DRY_RUN ? "DRY RUN" : "APPLYING"} · bucket ${bucket} · concurrency ${CONCURRENCY}`);
  let rows = await loadRows();
  if (LIMIT > 0) rows = rows.slice(0, LIMIT);
  console.log(`${rows.length} media rows to check`);

  let index = 0;
  let done = 0;
  const started = Date.now();
  const worker = async () => {
    while (index < rows.length) {
      const row = rows[index++];
      try {
        if (row.media_type === "video") await processVideo(row);
        else await processPhoto(row);
      } catch (error) {
        stats.errors += 1;
        console.warn(`  failed ${row.storage_path}: ${error instanceof Error ? error.message : error}`);
      }
      done += 1;
      if (done % 100 === 0) {
        const perSecond = done / ((Date.now() - started) / 1000);
        console.log(`  ${done}/${rows.length} (${perSecond.toFixed(1)}/s)`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log("\nSummary", { ...stats, dryRun: DRY_RUN, seconds: Math.round((Date.now() - started) / 1000) });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
