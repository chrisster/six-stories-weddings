import { type NextRequest, NextResponse } from "next/server";

import { getSignedMediaUrl } from "@/lib/storage";

export const runtime = "nodejs";

// Storage keys look like `${galleryId}/${uuid}.ext`. Only allow plain object
// keys so this route can never be turned into an open proxy or used to
// traverse outside our bucket.
const STORAGE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/;

// Streams a gallery video through our own origin. Presigned R2 URLs are not
// reliably playable directly in a browser <video> element (cross-origin), so
// the bytes are proxied here — forwarding the incoming Range header so seeking
// and native streaming keep working.
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path") || "";

  if (!path || path.includes("..") || path.includes("://") || !STORAGE_KEY.test(path)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const signedUrl = await getSignedMediaUrl(path);
    const range = request.headers.get("range");

    const upstream = await fetch(signedUrl, {
      headers: range ? { Range: range } : undefined,
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return new NextResponse("Upstream error", { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || "video/mp4");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=3600");

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);

    // Preserve 206 for range requests so <video> can seek.
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return new NextResponse("Could not stream video", { status: 500 });
  }
}
