import { Zip, ZipPassThrough } from "fflate";

import { getCurrentUser } from "@/lib/auth";
import { getGuestAccessByToken, getPublicGalleryBySlug, logGalleryEvent, portalEmailCanAccessProject } from "@/lib/data";
import { readPortalSession } from "@/lib/portal-auth";
import { getSignedMediaUrl } from "@/lib/storage";
import type { MediaAsset } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function slugifyName(value: string) {
  return value.replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "") || "gallery";
}

async function buildZipResponse(gallerySlug: string, idsCsv: string | null, token: string | null) {
  const detail = await getPublicGalleryBySlug(gallerySlug);
  if (!detail || !detail.gallery.allowDownloads) {
    return new Response("Not found", { status: 404 });
  }

  const adminUser = await getCurrentUser();
  const portalSession = await readPortalSession();
  const hasPortalAccess = portalSession
    ? await portalEmailCanAccessProject(portalSession.email, detail.project.id)
    : false;

  let guestAssetIds: string[] | null = null;
  let hasGuestAccess = false;
  if (token) {
    const access = await getGuestAccessByToken(token);
    if (access && access.galleryId === detail.gallery.id) {
      hasGuestAccess = true;
      guestAssetIds = access.mediaAssetIds;
    }
  }

  if (!adminUser && !hasPortalAccess && !hasGuestAccess) {
    return new Response("Unauthorized", { status: 403 });
  }

  let assets: MediaAsset[] = detail.mediaAssets;
  if (guestAssetIds && guestAssetIds.length > 0) {
    const allowed = new Set(guestAssetIds);
    assets = assets.filter((asset) => allowed.has(asset.id));
  }

  if (idsCsv) {
    const ids = new Set(idsCsv.split(",").map((id) => id.trim()).filter(Boolean));
    if (ids.size > 0) {
      assets = assets.filter((asset) => ids.has(asset.id));
    }
  }

  if (assets.length === 0) {
    return new Response("No files", { status: 404 });
  }

  // Count the bulk download once (non-admin viewers only).
  if (!adminUser) {
    await logGalleryEvent(detail.gallery.id, "download");
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
