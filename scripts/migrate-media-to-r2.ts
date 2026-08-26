/**
 * Reconciles media storage ahead of exposing the R2 bucket through a public
 * custom domain. Production already writes gallery media to the R2 bucket, so
 * this script:
 *
 *  1. copies any media object still living only in the Supabase bucket
 *     (early-era uploads) into R2,
 *  2. generates the `thumbs/<path>.webp` web preview for every photo with
 *     local sharp — reading the original from wherever it lives — so the
 *     deployed app never has to resize anything,
 *  3. moves contract PDFs OUT of the R2 bucket into the private Supabase
 *     bucket (copy → verify → delete from R2). Contracts must never be
 *     reachable from the public media domain, and src/lib/storage.ts already
 *     pins all document reads/writes to Supabase,
 *  4. stamps media_assets rows with storage_provider='r2'.
 *
 * Run it BEFORE connecting the public custom domain to the bucket — step 3 is
 * what makes going public safe.
 *
 * The script is idempotent: objects already in the right place are skipped,
 * so it can be re-run after a partial failure.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/migrate-media-to-r2.ts [--dry-run]
 *     [--verify] [--delete-source] [--concurrency=4]
 *
 *   --dry-run        report what would happen, change nothing
 *   --verify         only check that everything is in its final place
 *   --delete-source  after a media object is confirmed in R2, delete the
 *                    Supabase copy (contract PDFs are always deleted from R2
 *                    once verified in Supabase — that is the point)
 *
 * Requires in the environment (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID,
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME
 */

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
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
const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "sixstories";

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

type MediaItem = {
  path: string;
  kind: "photo" | "video" | "poster" | "hero";
  assetIds: string[];
};

const isExternal = (path: string) => path.startsWith("http://") || path.startsWith("https://");
const thumbKey = (path: string) => `thumbs/${path}.webp`;

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

async function collectMediaItems(): Promise<MediaItem[]> {
  const byPath = new Map<string, MediaItem>();
  const add = (path: string | null | undefined, kind: MediaItem["kind"], assetId?: string) => {
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

async function collectContractPaths(): Promise<string[]> {
  const { data, error } = await supabase
    .from("contracts")
    .select("pdf_path")
    .not("pdf_path", "is", null);
  if (error) throw new Error(`contracts query failed: ${error.message}`);
  return [...new Set((data ?? []).map((row) => row.pdf_path as string).filter(Boolean))].filter(
    (path) => !isExternal(path),
  );
}

// ---------------------------------------------------------------------------
// Storage primitives
// ---------------------------------------------------------------------------

async function headR2(key: string): Promise<{ exists: boolean; size: number }> {
  try {
    const result = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return { exists: true, size: result.ContentLength ?? 0 };
  } catch {
    return { exists: false, size: 0 };
  }
}

async function getR2Buffer(key: string): Promise<{ body: Buffer; contentType: string }> {
  const result = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  if (!result.Body) throw new Error(`empty body for R2 object ${key}`);
  return {
    body: Buffer.from(await result.Body.transformToByteArray()),
    contentType: result.ContentType || "application/octet-stream",
  };
}

async function uploadR2Buffer(key: string, body: Buffer, contentType: string) {
  await r2.send(
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

async function supabaseSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(`could not sign Supabase URL: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

async function supabaseDownload(path: string): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function uploadR2Stream(
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

// ---------------------------------------------------------------------------
// Media reconciliation: original in R2 + thumbs/ preview for photos
// ---------------------------------------------------------------------------

type MediaResult = {
  item: MediaItem;
  copied: boolean;
  thumbCreated: boolean;
  sourceDeleted: boolean;
  error?: string;
};

async function reconcileMedia(item: MediaItem): Promise<MediaResult> {
  const result: MediaResult = {
    item,
    copied: false,
    thumbCreated: false,
    sourceDeleted: false,
  };
  try {
    const existsR2 = (await headR2(item.path)).exists;
    const needsThumb = item.kind === "photo" && !(await headR2(thumbKey(item.path))).exists;

    if (verifyOnly) {
      if (!existsR2) result.error = "missing in R2";
      else if (needsThumb) result.error = "thumb missing in R2";
      return result;
    }
    if (dryRun) {
      result.copied = !existsR2;
      result.thumbCreated = needsThumb;
      return result;
    }

    let buffer: Buffer | null = null;

    if (!existsR2) {
      // Early-era object still only in Supabase — copy it over.
      const url = await supabaseSignedUrl(item.path);
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        throw new Error(`Supabase fetch failed (${response.status})`);
      }
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const contentLength = Number(response.headers.get("content-length") || 0);

      if (contentLength > MULTIPART_THRESHOLD) {
        await uploadR2Stream(item.path, contentType, response.body.getReader());
      } else {
        buffer = Buffer.from(await response.arrayBuffer());
        await uploadR2Buffer(item.path, buffer, contentType);
      }
      result.copied = true;
    }

    if (needsThumb) {
      if (!buffer) {
        buffer = (await getR2Buffer(item.path)).body;
      }
      try {
        const webp = await sharp(buffer, { failOn: "none" })
          .rotate()
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .webp({ quality: THUMB_QUALITY })
          .toBuffer();
        await uploadR2Buffer(thumbKey(item.path), webp, "image/webp");
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
      // Only remove the Supabase copy once the object is confirmed in R2.
      const inSupabase = (await supabaseDownload(item.path)) !== null;
      if (inSupabase && (await headR2(item.path)).exists) {
        const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove([item.path]);
        if (error) throw new Error(`Supabase delete failed: ${error.message}`);
        result.sourceDeleted = true;
      }
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Contract PDFs: move out of the (soon-public) R2 bucket into private Supabase
// ---------------------------------------------------------------------------

type ContractResult = {
  path: string;
  copied: boolean;
  removedFromR2: boolean;
  error?: string;
};

async function reconcileContract(path: string): Promise<ContractResult> {
  const result: ContractResult = { path, copied: false, removedFromR2: false };
  try {
    const inR2 = await headR2(path);
    const supabaseBytes = await supabaseDownload(path);

    if (verifyOnly) {
      if (!supabaseBytes) result.error = "missing in Supabase";
      else if (inR2.exists) result.error = "still present in R2 (public-domain hazard)";
      return result;
    }
    if (dryRun) {
      result.copied = !supabaseBytes && inR2.exists;
      result.removedFromR2 = inR2.exists;
      if (!supabaseBytes && !inR2.exists) result.error = "missing in BOTH stores";
      return result;
    }

    if (!supabaseBytes) {
      if (!inR2.exists) {
        throw new Error("missing in BOTH stores");
      }
      const { body, contentType } = await getR2Buffer(path);
      const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(path, body, {
        contentType: contentType === "application/octet-stream" ? "application/pdf" : contentType,
        upsert: true,
      });
      if (error) throw new Error(`Supabase upload failed: ${error.message}`);

      const verifyBytes = await supabaseDownload(path);
      if (!verifyBytes || verifyBytes.length !== body.length) {
        throw new Error("Supabase copy verification failed");
      }
      result.copied = true;
    }

    // The PDF is confirmed in Supabase — remove the R2 copy so the public
    // domain can never serve it. This always runs (not gated on
    // --delete-source): it is the safety step this script exists for.
    if (inR2.exists) {
      const finalCheck = await supabaseDownload(path);
      if (!finalCheck) throw new Error("refusing to delete from R2: Supabase copy unreadable");
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: path }));
      result.removedFromR2 = true;
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `${verifyOnly ? "Verifying" : dryRun ? "Dry-run of" : "Running"} storage reconciliation — R2 bucket "${R2_BUCKET}", Supabase bucket "${SUPABASE_BUCKET}"` +
      (deleteSource ? " (deleting Supabase media copies after confirmation)" : ""),
  );

  const [mediaItems, contractPaths] = await Promise.all([
    collectMediaItems(),
    collectContractPaths(),
  ]);
  console.log(
    `Found ${mediaItems.length} media objects and ${contractPaths.length} contract PDFs referenced by the database.\n`,
  );

  // Contracts first: they are few, and getting them out of the bucket is the
  // precondition for connecting the public domain.
  const contractResults: ContractResult[] = [];
  for (const path of contractPaths) {
    const result = await reconcileContract(path);
    contractResults.push(result);
    if (result.error) {
      console.error(`✗ contract ${path}: ${result.error}`);
    } else {
      const actions = [
        result.copied ? "copied→supabase" : "in-supabase",
        result.removedFromR2 ? "removed-from-R2" : "",
      ]
        .filter(Boolean)
        .join(" ");
      console.log(`✓ contract ${path} (${actions})`);
    }
  }

  const mediaResults: MediaResult[] = [];
  let index = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (index < mediaItems.length) {
        const current = mediaItems[index++];
        const position = `[${index}/${mediaItems.length}]`;
        const result = await reconcileMedia(current);
        mediaResults.push(result);
        if (result.error) {
          console.error(`${position} ✗ ${current.kind} ${current.path}: ${result.error}`);
        } else {
          const actions = [
            result.copied ? "copied→R2" : "in-R2",
            result.thumbCreated ? "+thumb" : "",
            result.sourceDeleted ? "-supabase-copy" : "",
          ]
            .filter(Boolean)
            .join(" ");
          console.log(`${position} ✓ ${current.kind} ${current.path} (${actions})`);
        }
      }
    }),
  );

  const mediaFailures = mediaResults.filter((r) => r.error);
  const contractFailures = contractResults.filter((r) => r.error);

  if (!verifyOnly && !dryRun && mediaFailures.length === 0) {
    const assetIds = mediaItems.flatMap((item) => item.assetIds);
    for (let i = 0; i < assetIds.length; i += 500) {
      const batch = assetIds.slice(i, i + 500);
      const { error } = await supabase
        .from("media_assets")
        .update({ storage_provider: "r2", storage_bucket: R2_BUCKET })
        .in("id", batch);
      if (error) throw new Error(`media_assets update failed: ${error.message}`);
    }
    console.log(`\nStamped ${assetIds.length} media_assets rows with storage_provider='r2'.`);
  } else if (!verifyOnly && !dryRun) {
    console.warn("\nDB rows NOT updated because some media objects failed — fix and re-run.");
  }

  console.log(
    `\nMedia: ${mediaResults.filter((r) => r.copied).length} copied, ${
      mediaResults.filter((r) => r.thumbCreated).length
    } thumbs created, ${mediaFailures.length} failed.` +
      `\nContracts: ${contractResults.filter((r) => r.copied).length} moved to Supabase, ${
        contractResults.filter((r) => r.removedFromR2).length
      } removed from R2, ${contractFailures.length} failed.`,
  );

  if (mediaFailures.length + contractFailures.length > 0) {
    process.exitCode = 1;
  } else if (!dryRun && !verifyOnly) {
    console.log("\n✓ Safe to connect the public custom domain to the bucket now.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
