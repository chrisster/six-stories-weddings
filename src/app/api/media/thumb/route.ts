import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";

import { getMediaBytes } from "@/lib/storage";

export const runtime = "nodejs";

// Storage keys look like `${galleryId}/${uuid}.ext`. Only allow plain object
// keys so this route can never be turned into an open image proxy or used to
// traverse outside our bucket.
const STORAGE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/;

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path") || "";
  const widthParam = Number(request.nextUrl.searchParams.get("w") || "640");
  const qualityParam = Number(request.nextUrl.searchParams.get("q") || "72");

  if (!path || path.includes("..") || path.includes("://") || !STORAGE_KEY.test(path)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const width = Math.min(2000, Math.max(16, Number.isFinite(widthParam) ? widthParam : 640));
  const quality = Math.min(90, Math.max(40, Number.isFinite(qualityParam) ? qualityParam : 72));

  try {
    const original = await getMediaBytes(path);
    if (!original) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const resized = await sharp(original.body, { failOn: "none" })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    return new NextResponse(new Uint8Array(resized), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        // Keys are content-addressed (random uuid per upload), so previews can
        // be cached aggressively by the browser and Vercel's CDN.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // On any failure the client <img> onError handler falls back to the
    // full-resolution URL, so the photo still renders.
    return NextResponse.json({ error: "Could not render preview" }, { status: 500 });
  }
}
