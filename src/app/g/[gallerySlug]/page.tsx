import { notFound, redirect } from "next/navigation";

import { PublicGallery } from "@/components/gallery/public-gallery";
import { getCurrentUser } from "@/lib/auth";
import { getGuestAccessByToken, getPublicGalleryBySlug, portalEmailCanAccessProject } from "@/lib/data";
import { readPortalSession } from "@/lib/portal-auth";
import { getSignedMediaUrl } from "@/lib/storage";

type PublicGalleryPageProps = {
  params: Promise<{ gallerySlug: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function PublicGalleryPage({ params, searchParams }: PublicGalleryPageProps) {
  const { gallerySlug } = await params;
  const { token } = await searchParams;

  const detail = await getPublicGalleryBySlug(gallerySlug);

  if (!detail) {
    notFound();
  }

  const portalSession = await readPortalSession();
  const adminUser = await getCurrentUser();

  let guestAssetIds: string[] | null = null;
  let hasGuestAccess = false;
  if (token) {
    const access = await getGuestAccessByToken(token);
    if (access && access.galleryId === detail.gallery.id) {
      hasGuestAccess = true;
      guestAssetIds = access.mediaAssetIds;
    }
  }

  const hasPortalAccess = portalSession
    ? await portalEmailCanAccessProject(portalSession.email, detail.project.id)
    : false;

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
      url: await getSignedMediaUrl(asset.storagePath),
      sectionName: sectionById.get(asset.sectionId || "") || "Moments",
      fileName: asset.originalName || "",
    })),
  );

  const cover = media.find((asset) => asset.id === detail.gallery.coverMediaId) || media[0];

  return (
    <main className="min-h-screen bg-white">
      <PublicGallery
        assets={media}
        galleryId={detail.gallery.id}
        gallerySlug={gallerySlug}
        allowDownloads={detail.gallery.allowDownloads}
        coupleNames={detail.project.title || detail.gallery.title}
        eventDate={detail.project.eventDate}
        coverUrl={cover && cover.mediaType === "photo" ? cover.url : null}
        sectionOrder={detail.sections.map((section) => section.name)}
      />
    </main>
  );
}