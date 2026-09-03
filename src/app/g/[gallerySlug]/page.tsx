import { notFound, redirect } from "next/navigation";

import { PublicGallery } from "@/components/gallery/public-gallery";
import { getCurrentUser } from "@/lib/auth";
import { getGalleryCommentCounts, getGuestAccessByToken, getPublicGalleryBySlug, portalEmailCanAccessProject } from "@/lib/data";
import { readPortalSession } from "@/lib/portal-auth";
import { getMediaThumbFallbackUrl, getMediaThumbUrl, getMediaStreamUrl, getSignedMediaUrl } from "@/lib/storage";

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
    getCurrentUser(),
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

  const sectionById = new Map(detail.sections.map((section) => [section.id, section.name]));
  const media = await Promise.all(
    visibleAssets.map(async (asset) => ({
      ...asset,
      url:
        asset.mediaType === "video"
          ? getMediaStreamUrl(asset.storagePath)
          : await getSignedMediaUrl(asset.storagePath),
      thumbUrl:
        asset.mediaType === "photo"
          ? getMediaThumbUrl(asset.storagePath, { width: 1000 })
          : getMediaStreamUrl(asset.storagePath),
      thumbFallbackUrl:
        asset.mediaType === "photo"
          ? getMediaThumbFallbackUrl(asset.storagePath, { width: 1000 })
          : null,
      posterUrl:
        asset.mediaType === "video" && asset.thumbnailPath
          ? await getSignedMediaUrl(asset.thumbnailPath).catch(() => null)
          : null,
      sectionName: sectionById.get(asset.sectionId || "") || "Photos",
      fileName: asset.originalName || "",
    })),
  );

  const cover = media.find((asset) => asset.id === detail.gallery.coverMediaId) || media[0];
  const customHeroUrl = detail.gallery.heroImagePath
    ? await getSignedMediaUrl(detail.gallery.heroImagePath).catch(() => null)
    : null;
  const heroUrl = customHeroUrl || (cover && cover.mediaType === "photo" ? cover.url : null);

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
        assets={media}
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