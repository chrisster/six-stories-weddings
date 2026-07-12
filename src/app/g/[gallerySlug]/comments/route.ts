import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getPublicGalleryBySlug, portalEmailCanAccessProject } from "@/lib/data";
import { getGalleryEmailEnv } from "@/lib/env";
import { sendGalleryNotificationEmail } from "@/lib/gallery-notifications";
import { readPortalSession } from "@/lib/portal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function resolveGallery(slug: string) {
  const detail = await getPublicGalleryBySlug(slug);
  return detail;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const assetId = request.nextUrl.searchParams.get("asset") || "";

  const detail = await resolveGallery(gallerySlug);
  if (!detail) {
    return NextResponse.json({ comments: [] });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ comments: [] });
  }

  let query = admin
    .from("gallery_comments")
    .select("id, media_asset_id, guest_name, comment_body, timestamp_seconds, created_at")
    .eq("gallery_id", detail.gallery.id)
    .order("timestamp_seconds", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (assetId) {
    query = query.eq("media_asset_id", assetId);
  }

  const { data } = await query;

  return NextResponse.json({
    comments: (data || []).map((row) => ({
      id: String(row.id),
      mediaAssetId: row.media_asset_id ? String(row.media_asset_id) : null,
      guestName: (row.guest_name as string | null) || null,
      body: String(row.comment_body || ""),
      timestampSeconds: row.timestamp_seconds != null ? Number(row.timestamp_seconds) : null,
      createdAt: String(row.created_at || ""),
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gallerySlug: string }> },
) {
  const { gallerySlug } = await params;
  const body = (await request.json().catch(() => null)) as {
    mediaAssetId?: string;
    guestName?: string;
    body?: string;
    timestampSeconds?: number | null;
  } | null;

  const mediaAssetId = String(body?.mediaAssetId || "").trim();
  const commentBody = String(body?.body || "").trim();
  const guestName = String(body?.guestName || "").trim();
  const timestampSeconds =
    typeof body?.timestampSeconds === "number" && Number.isFinite(body.timestampSeconds)
      ? Math.max(0, Math.floor(body.timestampSeconds))
      : null;

  if (!mediaAssetId || !commentBody) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  if (commentBody.length > 2000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }

  const detail = await resolveGallery(gallerySlug);
  if (!detail) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  // Comments are restricted to logged-in clients (portal) or studio admins.
  const adminUser = await getCurrentUser();
  const portalSession = await readPortalSession();
  const hasPortalAccess = portalSession
    ? await portalEmailCanAccessProject(portalSession.email, detail.project.id)
    : false;

  if (!adminUser && !hasPortalAccess) {
    return NextResponse.json({ error: "Please sign in to comment." }, { status: 401 });
  }

  // Ensure the asset belongs to this gallery.
  const asset = detail.mediaAssets.find((item) => item.id === mediaAssetId);
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  const identityName =
    guestName ||
    (portalSession?.email ? portalSession.email.split("@")[0] : "") ||
    (adminUser?.email ? "Six Stories Studio" : "") ||
    "Guest";

  const { data, error } = await admin
    .from("gallery_comments")
    .insert({
      gallery_id: detail.gallery.id,
      media_asset_id: mediaAssetId,
      guest_name: identityName,
      comment_body: commentBody,
      timestamp_seconds: timestampSeconds,
    })
    .select("id, media_asset_id, guest_name, comment_body, timestamp_seconds, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not save comment" }, { status: 500 });
  }

  // Notify the studio by email (best-effort; never blocks the response result).
  try {
    const { replyTo, fromEmail } = getGalleryEmailEnv();
    const adminRecipient = (replyTo || fromEmail || "").trim();
    if (adminRecipient) {
      const isVideo = asset.mediaType === "video";
      let whenLabel = "";
      if (timestampSeconds != null) {
        const mins = Math.floor(timestampSeconds / 60);
        const secs = timestampSeconds % 60;
        whenLabel = ` at ${mins}:${secs.toString().padStart(2, "0")}`;
      }
      const projectTitle = detail.project.title || detail.gallery.title;
      const mediaLabel = isVideo ? "a film" : "a photo";
      const subject = `New comment on ${projectTitle}`;
      const safeBody = commentBody.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = `
        <div style="font-family:Georgia,'Times New Roman',serif;background:#f3f1ee;padding:24px;">
          <div style="max-width:560px;margin:0 auto;background:#fff;padding:24px;">
            <p style="margin:0 0 8px;color:#2d2d2d;letter-spacing:0.12em;text-transform:uppercase;">Six Stories</p>
            <h1 style="margin:0 0 12px;font-size:18px;color:#202020;">New gallery comment</h1>
            <p style="margin:0 0 12px;color:#474747;font-size:14px;line-height:1.7;">
              ${identityName || "A client"} left a comment on ${mediaLabel}${whenLabel} in
              <strong>${projectTitle}</strong>.
            </p>
            <blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid #d9d7d2;color:#333;font-size:14px;">
              ${safeBody}
            </blockquote>
          </div>
        </div>`;
      const text = `${identityName || "A client"} commented on ${mediaLabel}${whenLabel} in ${projectTitle}:\n\n${commentBody}`;
      await sendGalleryNotificationEmail({ to: adminRecipient, subject, html, text });
    }
  } catch (notifyError) {
    console.error("comment notify failed", notifyError);
  }

  return NextResponse.json({
    comment: {
      id: String(data.id),
      mediaAssetId: data.media_asset_id ? String(data.media_asset_id) : null,
      guestName: (data.guest_name as string | null) || null,
      body: String(data.comment_body || ""),
      timestampSeconds: data.timestamp_seconds != null ? Number(data.timestamp_seconds) : null,
      createdAt: String(data.created_at || ""),
    },
  });
}
