import { createRequire } from "node:module";
import { Readable } from "node:stream";

import { getPublicGalleryBySlug } from "@/lib/data";
import { getSignedMediaUrl } from "@/lib/storage";
import type { MediaAsset } from "@/lib/types";

const require = createRequire(import.meta.url);
const archiver = require("archiver") as (
  format: string,
  options?: import("archiver").ArchiverOptions,
) => import("archiver").Archiver;

export const runtime = "nodejs";
export const maxDuration = 300;

function slugifyName(value: string) {
  return value.replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "") || "gallery";
}

async function buildZipResponse(gallerySlug: string, idsCsv: string | null) {
  const detail = await getPublicGalleryBySlug(gallerySlug);
  if (!detail || !detail.gallery.allowDownloads) {
    return new Response("Not found", { status: 404 });
  }

  let assets: MediaAsset[] = detail.mediaAssets;
  if (idsCsv) {
    const ids = new Set(idsCsv.split(",").map((id) => id.trim()).filter(Boolean));
    if (ids.size > 0) {
      assets = assets.filter((asset) => ids.has(asset.id));
    }
  }

  if (assets.length === 0) {
    return new Response("No files", { status: 404 });
  }

  const archive = archiver("zip", { store: true });
  archive.on("error", () => {
    archive.destroy();
  });

  // Stream files into the archive one at a time to keep memory bounded.
  (async () => {
    const used = new Set<string>();
    for (const asset of assets) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const signedUrl = await getSignedMediaUrl(asset.storagePath);
        // eslint-disable-next-line no-await-in-loop
        const upstream = await fetch(signedUrl);
        if (!upstream.ok) continue;
        // eslint-disable-next-line no-await-in-loop
        const buffer = Buffer.from(await upstream.arrayBuffer());

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

        archive.append(buffer, { name: finalName });
      } catch {
        // skip individual file failures
      }
    }
    archive.finalize();
  })();

  const zipName = `${slugifyName(detail.project.title || detail.gallery.title)}.zip`;
  const headers = new Headers();
  headers.set("Content-Type", "application/zip");
  headers.set("Content-Disposition", `attachment; filename="${zipName}"`);
  headers.set("Cache-Control", "no-store");

  return new Response(Readable.toWeb(archive) as unknown as ReadableStream, { headers });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const idsCsv = new URL(request.url).searchParams.get("assets");
  return buildZipResponse(gallerySlug, idsCsv);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const formData = await request.formData();
  const idsCsv = String(formData.get("assets") || "") || null;
  return buildZipResponse(gallerySlug, idsCsv);
}
