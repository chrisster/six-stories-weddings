import { notFound, redirect } from "next/navigation";

import { PublicGallery } from "@/components/gallery/public-gallery";
import { getStudioUser } from "@/lib/auth";
import {
  getGalleryCommentCounts,
  getGuestAccessByToken,
  getPublicGalleryBySlug,
  portalEmailCanAccessProject,
} from "@/lib/data";
import { assetUrls, type GalleryAsset } from "@/lib/gallery-assets";
import { readPortalSession } from "@/lib/portal-auth";
import {
  getMediaStreamUrl,
  getMediaThumbUrl,
  getPublicMediaBase,
  getSignedMediaUrl,
} from "@/lib/storage";

type PublicGalleryPageProps = {
  params: Promise<{ gallerySlug: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function PublicGalleryPage({ params, searchParams }: PublicGalleryPageProps) {
  const { gallerySlug } = await params;
  const { token } = await searchParams;

  // Gallery, sessions and the guest token resolve in parallel: one round trip
  // instead of four before the page can decide whether the visitor may enter.
  const [detail, portalSession, adminUser, guestAccess] = await Promise.all([
    getPublicGalleryBySlug(gallerySlug),
    readPortalSession(),
    getStudioUser(),
    token ? getGuestAccessByToken(token) : Promise.resolve(null),
  ]);

  if (!detail) {
    notFound();
  }

  let guestAssetIds: string[] | null = null;
  let hasGuestAccess = false;
  if (guestAccess && guestAccess.galleryId === detail.gallery.id) {
    hasGuestAccess = true;
    guestAssetIds = guestAccess.mediaAssetIds;
  }

  const [hasPortalAccess, commentCounts] = await Promise.all([
    portalSession
      ? portalEmailCanAccessProject(portalSession.email, detail.project.id)
      : Promise.resolve(false),
    detail.gallery.allowComments
      ? getGalleryCommentCounts(detail.gallery.id)
      : Promise.resolve<Record<string, number>>({}),
  ]);

  const hasAccess = Boolean(adminUser || hasPortalAccess || hasGuestAccess);
  if (!hasAccess) {
    const nextUrl = `/g/${gallerySlug}`;
    redirect(`/portal/login?error=${encodeURIComponent("Please sign in to access this gallery")}&next=${encodeURIComponent(nextUrl)}`);
  }

  const permittedIds = guestAssetIds && guestAssetIds.length > 0 ? new Set(guestAssetIds) : null;
  const visibleAssets = permittedIds
    ? detail.mediaAssets.filter((asset) => permittedIds.has(asset.id))
    : detail.mediaAssets;

  // With the public media domain, the browser derives every URL from the
  // storage key and one shared base, which keeps the payload for a
  // thousand-photo gallery small. Without it (local dev, Supabase fallback)
  // each photo carries explicit signed URLs.
  const mediaBase = getPublicMediaBase();
  const sectionById = new Map(detail.sections.map((section) => [section.id, section.name]));
  const assets: GalleryAsset[] = await Promise.all(
    visibleAssets.map(async (asset) => {
      const external =
        asset.storagePath.startsWith("http://") || asset.storagePath.startsWith("https://");
      const base: GalleryAsset = {
        id: asset.id,
        key: asset.storagePath,
        type: asset.mediaType,
        section: sectionById.get(asset.sectionId || "") || "Photos",
        name: asset.originalName || "",
        w: asset.width ?? null,
        h: asset.height ?? null,
        poster:
          asset.mediaType === "video" && asset.thumbnailPath
            ? await getSignedMediaUrl(asset.thumbnailPath).catch(() => null)
            : null,
      };

      if (asset.mediaType === "video") {
        return { ...base, url: getMediaStreamUrl(asset.storagePath) };
      }
      if (mediaBase && !external) {
        return base;
      }
      return {
        ...base,
        url: await getSignedMediaUrl(asset.storagePath),
        thumb: getMediaThumbUrl(asset.storagePath, { size: "lg" }),
        small: getMediaThumbUrl(asset.storagePath, { size: "sm" }),
      };
    }),
  );

  // The hero shows the 1600px preview of the cover photo (or the custom hero
  // image, which is already downscaled), never the multi-megabyte original.
  const cover = assets.find((asset) => asset.id === detail.gallery.coverMediaId) || assets[0];
  const customHeroUrl = detail.gallery.heroImagePath
    ? await getSignedMediaUrl(detail.gallery.heroImagePath).catch(() => null)
    : null;
  const heroUrl =
    customHeroUrl || (cover && cover.type === "photo" ? assetUrls(cover, mediaBase).large : null);

  const commentsEnabled = detail.gallery.allowComments;
  const canComment = commentsEnabled && Boolean(adminUser || hasPortalAccess);
  const commenterName = portalSession?.email
    ? portalSession.email.split("@")[0]
    : adminUser?.email
      ? "Six Stories Studio"
      : null;

  return (
    <main className="min-h-screen bg-white">
      <PublicGallery
        assets={assets}
        mediaBase={mediaBase}
        galleryId={detail.gallery.id}
        gallerySlug={gallerySlug}
        allowDownloads={detail.gallery.allowDownloads}
        coupleNames={detail.project.title || detail.gallery.title}
        eventDate={detail.project.eventDate}
        coverUrl={heroUrl}
        sectionOrder={detail.sections.map((section) => section.name)}
        canComment={canComment}
        commentsEnabled={commentsEnabled}
        commenterName={commenterName}
        commentCounts={commentCounts}
      />
    </main>
  );
}
