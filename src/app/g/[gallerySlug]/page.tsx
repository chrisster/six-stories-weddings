import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { PublicGallery } from "@/components/gallery/public-gallery";
import { getPublicGalleryBySlug, getGalleryByGuestToken } from "@/lib/data";
import { readPortalSession } from "@/lib/portal-auth";
import { portalEmailCanAccessProject } from "@/lib/data";
import { getSignedMediaUrl } from "@/lib/storage";

type PublicGalleryPageProps = {
  params: Promise<{ gallerySlug: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function PublicGalleryPage({ params, searchParams }: PublicGalleryPageProps) {
  const { gallerySlug } = await params;
  const { token } = await searchParams;

  // Check for guest link access first
  let detail = null;
  let hasGuestAccess = false;

  if (token) {
    const guestGallery = await getGalleryByGuestToken(token);
    if (guestGallery) {
      detail = guestGallery;
      hasGuestAccess = true;
    }
  }

  // If no guest access, try regular gallery lookup
  if (!detail) {
    detail = await getPublicGalleryBySlug(gallerySlug);
  }

  if (!detail) {
    notFound();
  }

  const cookieStore = await cookies();
  const passCookie = cookieStore.get(`gallery_access_${gallerySlug}`)?.value;
  const portalSession = await readPortalSession();
  const hasPortalAccess = portalSession
    ? await portalEmailCanAccessProject(portalSession.email, detail.project.id)
    : false;

  // Guest link access bypasses passcode
  const passcodeLocked = hasGuestAccess ? false : detail.gallery.hasPasscode && passCookie !== "ok" && !hasPortalAccess;

  const sectionById = new Map(detail.sections.map((section) => [section.id, section.name]));
  const media = await Promise.all(
    detail.mediaAssets.map(async (asset) => ({
      ...asset,
      url: await getSignedMediaUrl(asset.storagePath),
      sectionName: sectionById.get(asset.sectionId || "") || "Moments",
      fileName: asset.originalName || "",
    })),
  );

  const cover = media.find((asset) => asset.id === detail.gallery.coverMediaId) || media[0];

  if (passcodeLocked) {
    return (
      <main className="container-editorial py-16">
        <section className="mx-auto w-full max-w-md rounded-3xl border border-border/90 bg-white p-8 shadow-sm">
          <p className="quiet-label">Private Gallery</p>
          <h1 className="title-cinematic mt-3 text-4xl font-semibold">{detail.gallery.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter the passcode to view your wedding gallery.</p>

          <form action={`/g/${gallerySlug}/unlock`} method="post" className="mt-6 space-y-3">
            <input
              type="password"
              name="passcode"
              required
              className="h-11 w-full rounded-xl border border-border px-3 text-sm"
              placeholder="Passcode"
            />
            <button type="submit" className="h-11 w-full rounded-full border border-foreground bg-foreground text-sm text-background">
              Unlock Gallery
            </button>
          </form>
        </section>
      </main>
    );
  }

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