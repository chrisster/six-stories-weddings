import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicGalleryBySlug } from "@/lib/data";

type RouteParams = {
  params: Promise<{ gallerySlug: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { gallerySlug } = await params;
  const formData = await request.formData();
  const passcode = String(formData.get("passcode") || "");

  const detail = await getPublicGalleryBySlug(gallerySlug);
  if (!detail) {
    return NextResponse.redirect(new URL(`/g/${gallerySlug}`, request.url));
  }

  const hashed = detail.gallery.passcodeHash;
  if (!hashed) {
    return NextResponse.redirect(new URL(`/g/${gallerySlug}`, request.url));
  }

  const valid = await bcrypt.compare(passcode, hashed);
  if (!valid) {
    return NextResponse.redirect(new URL(`/g/${gallerySlug}`, request.url));
  }

  const response = NextResponse.redirect(new URL(`/g/${gallerySlug}`, request.url));
  response.cookies.set(`gallery_access_${gallerySlug}`, "ok", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}