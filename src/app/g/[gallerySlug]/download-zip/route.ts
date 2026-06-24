import { createRequire } from "node:module";
import { PassThrough, Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

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
  try {
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

    const output = new PassThrough();
    const archive = archiver("zip", { store: true });

    archive.on("warning", () => {
      // Skip non-fatal archive warnings so a single problematic entry does not
      // kill the entire download.
    });
    archive.on("error", (error: Error) => {
      output.destroy(error);
    });
    archive.pipe(output);

    void (async () => {
      const used = new Set<string>();
      try {
        for (const asset of assets) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const signedUrl = await getSignedMediaUrl(asset.storagePath);
            // eslint-disable-next-line no-await-in-loop
            const upstream = await fetch(signedUrl);
            if (!upstream.ok || !upstream.body) continue;

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

            archive.append(
              Readable.fromWeb(upstream.body as unknown as NodeReadableStream),
              { name: finalName },
            );
          } catch {
            // skip individual file failures
          }
        }
        await archive.finalize();
      } catch (error) {
        output.destroy(error instanceof Error ? error : new Error("ZIP stream failed"));
      }
    })();

    const zipName = `${slugifyName(detail.project.title || detail.gallery.title)}.zip`;
    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set("Content-Disposition", `attachment; filename="${zipName}"`);
    headers.set("Cache-Control", "no-store");

    return new Response(Readable.toWeb(output) as unknown as ReadableStream, { headers });
  } catch {
    return new Response("ZIP generation failed", { status: 500 });
  }
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
