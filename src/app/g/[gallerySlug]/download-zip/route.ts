import { Zip, ZipPassThrough } from "fflate";

import { getPublicGalleryBySlug } from "@/lib/data";
import { getSignedMediaUrl } from "@/lib/storage";
import type { MediaAsset } from "@/lib/types";

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

  // Pure-JS streaming ZIP via fflate — no Node stream dependencies, works on
  // Vercel without any bundling configuration.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, data, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        controller.enqueue(data);
        if (final) controller.close();
      });

      const used = new Set<string>();

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

          // ZipPassThrough = STORE (no compression) — ideal for JPEGs.
          const entry = new ZipPassThrough(finalName);
          zip.add(entry);

          const reader = upstream.body.getReader();
          // eslint-disable-next-line no-await-in-loop
          while (true) {
            // eslint-disable-next-line no-await-in-loop
            const { done, value } = await reader.read();
            if (done) {
              entry.push(new Uint8Array(0), true);
              break;
            }
            if (value) entry.push(value, false);
          }
        } catch {
          // skip individual file failures and continue
        }
      }

      zip.end();
    },
  });

  const zipName = `${slugifyName(detail.project.title || detail.gallery.title)}.zip`;
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
