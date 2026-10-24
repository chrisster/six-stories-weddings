import { createHash } from "crypto";

import { Zip, ZipPassThrough } from "fflate";

import { getMediaFetchUrl, getSignedMediaUrl, headMediaObject, storeMediaObjectStream } from "@/lib/storage";
import type { MediaAsset } from "@/lib/types";

// Shared by the client gallery's zip download and the admin favorites zip.

export function slugifyName(value: string) {
  return value.replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "") || "gallery";
}

/** Deduplicated archive entry names, keeping original filenames. */
export function entryNames(assets: MediaAsset[]): Array<{ asset: MediaAsset; name: string }> {
  const used = new Set<string>();
  const entries: Array<{ asset: MediaAsset; name: string }> = [];

  for (const asset of assets) {
    const ext = asset.storagePath.split(".").pop() || "jpg";
    let name = asset.originalName || `photo-${asset.id}`;
    if (!/\.[a-z0-9]+$/i.test(name)) name = `${name}.${ext}`;

    let finalName = name;
    let counter = 1;
    while (used.has(finalName)) {
      const dot = name.lastIndexOf(".");
      finalName =
        dot > 0 ? `${name.slice(0, dot)}-${counter}${name.slice(dot)}` : `${name}-${counter}`;
      counter += 1;
    }
    used.add(finalName);
    entries.push({ asset, name: finalName });
  }

  return entries;
}

// Files up to this size are downloaded whole, several at once, ahead of the
// one being written; larger ones (videos) stream in their turn so memory stays
// bounded. Fetching one photo at a time left the function waiting on storage
// round trips for most of the build.
const PREFETCH_WINDOW = 8;
const BUFFER_LIMIT = 48 * 1024 * 1024;

type PreparedEntry =
  | { kind: "buffer"; data: Uint8Array }
  | { kind: "stream"; body: ReadableStream<Uint8Array> }
  | { kind: "skip" };

async function prepareEntry(asset: MediaAsset): Promise<PreparedEntry> {
  try {
    // The storage API endpoint, not the public media domain: large objects
    // came through the CDN domain at ~1 MB/s, which made video zips time out.
    const sourceUrl = await getMediaFetchUrl(asset.storagePath);
    const upstream = await fetch(sourceUrl);
    if (!upstream.ok || !upstream.body) return { kind: "skip" };
    const length = Number(upstream.headers.get("content-length") || "0");
    if (length > 0 && length <= BUFFER_LIMIT) {
      return { kind: "buffer", data: new Uint8Array(await upstream.arrayBuffer()) };
    }
    return { kind: "stream", body: upstream.body };
  } catch {
    // Skip individual file failures and continue.
    return { kind: "skip" };
  }
}

// Pure-JS streaming ZIP via fflate. ZipPassThrough = STORE (no compression) —
// ideal for JPEGs. The generator yields archive bytes as they are produced;
// pauses between yields provide backpressure against the consumer.
export async function* zipChunks(
  entries: Array<{ asset: MediaAsset; name: string }>,
): AsyncGenerator<Uint8Array> {
  const pending: Uint8Array[] = [];
  let zipError: Error | null = null;

  const zip = new Zip((err, data) => {
    if (err) {
      zipError = err instanceof Error ? err : new Error(String(err));
      return;
    }
    if (data.length > 0) pending.push(data);
  });

  // Entries are written strictly in order; up to PREFETCH_WINDOW of the next
  // files are already being fetched while the current one is written.
  const prepared: Array<Promise<PreparedEntry> | undefined> = [];
  const ensurePrefetched = (from: number) => {
    for (let i = from; i < Math.min(entries.length, from + PREFETCH_WINDOW); i += 1) {
      if (!prepared[i]) prepared[i] = prepareEntry(entries[i].asset);
    }
  };

  for (let index = 0; index < entries.length; index += 1) {
    ensurePrefetched(index);
    const item = await prepared[index]!;
    prepared[index] = undefined; // release the buffer once written
    if (item.kind === "skip") continue;

    const entry = new ZipPassThrough(entries[index].name);
    zip.add(entry);

    if (item.kind === "buffer") {
      entry.push(item.data, true);
      if (zipError) throw zipError;
      while (pending.length > 0) yield pending.shift()!;
      continue;
    }

    const reader = item.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        entry.push(value, false);
        if (zipError) throw zipError;
        while (pending.length > 0) yield pending.shift()!;
      }
    } catch (error) {
      if (zipError) throw error;
      // A broken stream mid-file: close the entry with what arrived.
    }
    entry.push(new Uint8Array(0), true);
    if (zipError) throw zipError;
    while (pending.length > 0) yield pending.shift()!;
  }

  zip.end();
  if (zipError) throw zipError;
  while (pending.length > 0) yield pending.shift()!;
}

/** Content-addressed hash of a set of assets, used in cached archive keys. */
export function assetSetHash(assets: MediaAsset[]): string {
  return createHash("sha1")
    .update(
      assets
        .map((asset) => `${asset.id}:${asset.storagePath}`)
        .sort()
        .join("\n"),
    )
    .digest("hex")
    .slice(0, 16);
}

/**
 * Builds the archive at `key` in storage unless it already exists, and returns
 * a URL the browser can be redirected to.
 */
export async function ensureZipInStorage(
  key: string,
  zipName: string,
  assets: MediaAsset[],
): Promise<string> {
  if (!(await headMediaObject(key))) {
    await storeMediaObjectStream(
      key,
      {
        contentType: "application/zip",
        contentDisposition: `attachment; filename="${zipName.replace(/["\\\r\n]/g, "")}"`,
      },
      zipChunks(entryNames(assets)),
    );
  }
  return getSignedMediaUrl(key);
}
