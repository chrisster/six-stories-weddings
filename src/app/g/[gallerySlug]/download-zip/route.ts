import { createHash } from "crypto";

import { Zip, ZipPassThrough } from "fflate";
import { NextResponse } from "next/server";

import { getStudioUser } from "@/lib/auth";
import { getGuestAccessByToken, getPublicGalleryBySlug, logGalleryEvent, portalEmailCanAccessProject } from "@/lib/data";
import { readPortalSession } from "@/lib/portal-auth";
import {
  deleteStoredObjects,
  getSignedMediaUrl,
  headMediaObject,
  isR2PublicEnabled,
  listMediaObjectKeys,
  storeMediaObjectStream,
} from "@/lib/storage";
import type { MediaAsset } from "@/lib/types";

export const runtime = "nodejs";
// Building a full-gallery archive (videos included) can take minutes; 800s is
// the Pro plan ceiling with Fluid compute.
export const maxDuration = 800;

function slugifyName(value: string) {
  return value.replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "") || "gallery";
}

/** Deduplicated archive entry names, keeping original filenames. */
function entryNames(assets: MediaAsset[]): Array<{ asset: MediaAsset; name: string }> {
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
    const signedUrl = await getSignedMediaUrl(asset.storagePath);
    const upstream = await fetch(signedUrl);
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
async function* zipChunks(
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

async function buildZipResponse(gallerySlug: string, idsCsv: string | null, token: string | null) {
  // The archive needs the media list, but the sessions and the guest token
  // can resolve alongside it instead of one after the other.
  const [detail, adminUser, portalSession, guestAccess] = await Promise.all([
    getPublicGalleryBySlug(gallerySlug),
    getStudioUser(),
    readPortalSession(),
    token ? getGuestAccessByToken(token) : Promise.resolve(null),
  ]);
  if (!detail || !detail.gallery.allowDownloads) {
    return new Response("Not found", { status: 404 });
  }

  const hasPortalAccess = portalSession
    ? await portalEmailCanAccessProject(portalSession.email, detail.project.id)
    : false;

  let guestAssetIds: string[] | null = null;
  let hasGuestAccess = false;
  if (guestAccess && guestAccess.galleryId === detail.gallery.id) {
    hasGuestAccess = true;
    guestAssetIds = guestAccess.mediaAssetIds;
  }

  if (!adminUser && !hasPortalAccess && !hasGuestAccess) {
    return new Response("Unauthorized", { status: 403 });
  }

  let assets: MediaAsset[] = detail.mediaAssets;
  if (guestAssetIds && guestAssetIds.length > 0) {
    const allowed = new Set(guestAssetIds);
    assets = assets.filter((asset) => allowed.has(asset.id));
  }

  let isSubset = false;
  if (idsCsv) {
    const ids = new Set(idsCsv.split(",").map((id) => id.trim()).filter(Boolean));
    if (ids.size > 0) {
      const filtered = assets.filter((asset) => ids.has(asset.id));
      isSubset = filtered.length !== detail.mediaAssets.length;
      assets = filtered;
    }
  }
  if (guestAssetIds && guestAssetIds.length > 0) {
    isSubset = isSubset || assets.length !== detail.mediaAssets.length;
  }

  if (assets.length === 0) {
    return new Response("No files", { status: 404 });
  }

  // Count the bulk download once (non-admin viewers only).
  if (!adminUser) {
    await logGalleryEvent(detail.gallery.id, "download");
  }

  // Name photo-only and video-only archives apart so both can sit side by side.
  const hasPhotos = assets.some((asset) => asset.mediaType !== "video");
  const hasVideos = assets.some((asset) => asset.mediaType === "video");
  const kindSuffix = hasPhotos && hasVideos ? "" : hasVideos ? "-videos" : "-photos";
  const zipName = `${slugifyName(detail.project.title || detail.gallery.title)}${kindSuffix}.zip`;
  const entries = entryNames(assets);

  // With the public R2 domain available, assemble the archive once inside R2
  // and redirect to it: the storage→function→storage copy never touches
  // Vercel's CDN (no Fast Origin Transfer), and repeat downloads redirect to
  // the cached object instantly. Keys are content-addressed by the asset ids
  // and their storage paths, so any change to the gallery — including a photo
  // replaced in place by the uploader — selects a fresh key.
  if (isR2PublicEnabled()) {
    const hash = createHash("sha1")
      .update(
        assets
          .map((asset) => `${asset.id}:${asset.storagePath}`)
          .sort()
          .join("\n"),
      )
      .digest("hex")
      .slice(0, 16);
    const scope = isSubset ? "sel" : "full";
    const zipKey = `zips/${detail.gallery.id}/${scope}-${hash}.zip`;

    if (!(await headMediaObject(zipKey))) {
      if (scope === "full") {
        // Drop superseded full-gallery archives; selection archives are left
        // to the bucket's lifecycle rule.
        const stale = (await listMediaObjectKeys(`zips/${detail.gallery.id}/full-`)).filter(
          (key) => key !== zipKey,
        );
        if (stale.length > 0) {
          await deleteStoredObjects(stale).catch(() => {});
        }
      }

      await storeMediaObjectStream(
        zipKey,
        {
          contentType: "application/zip",
          contentDisposition: `attachment; filename="${zipName}"`,
        },
        zipChunks(entries),
      );
    }

    const publicUrl = await getSignedMediaUrl(zipKey);
    return NextResponse.redirect(publicUrl, 302);
  }

  // Legacy path (no public R2 domain): stream the archive through this
  // function response.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of zipChunks(entries)) {
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  const headers = new Headers();
  headers.set("Content-Type", "application/zip");
  headers.set("Content-Disposition", `attachment; filename="${zipName}"`);
  headers.set("Cache-Control", "no-store");

  return new Response(stream, { headers });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const url = new URL(request.url);
  const idsCsv = url.searchParams.get("assets");
  const token = url.searchParams.get("token");
  return buildZipResponse(gallerySlug, idsCsv, token);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const formData = await request.formData();
  const idsCsv = String(formData.get("assets") || "") || null;
  const token = String(formData.get("token") || "") || null;
  return buildZipResponse(gallerySlug, idsCsv, token);
}
