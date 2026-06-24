import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addDemoMediaAction,
  createGallerySectionAction,
} from "@/app/admin/galleries/[id]/actions";
import { MediaUploader } from "@/components/gallery/media-uploader";
import { MediaManager } from "@/components/gallery/media-manager";
import { updateGallerySettingsAction } from "@/app/admin/galleries/[id]/actions";
import { getGalleryById, getGalleryFavorites } from "@/lib/data";
import { getSignedMediaUrl } from "@/lib/storage";
import { SectionRow } from "./section-row";

type GalleryManagerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function GalleryManagerPage({ params }: GalleryManagerPageProps) {
  const { id } = await params;
  const detail = await getGalleryById(id);
  if (!detail) {
    notFound();
  }

  const mediaWithUrl = await Promise.all(
    detail.mediaAssets.map(async (asset) => {
      try {
        const url = await getSignedMediaUrl(asset.storagePath);
        return { ...asset, url, broken: false };
      } catch {
        return {
          ...asset,
          url: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80",
          broken: true,
        };
      }
    }),
  );

  const cover = mediaWithUrl.find((asset) => asset.isCover) || mediaWithUrl[0] || null;

  const favorites = await getGalleryFavorites(detail.gallery.id);
  const favoritedMedia = mediaWithUrl
    .filter((asset) => favorites.counts[asset.id])
    .sort((a, b) => (favorites.counts[b.id] || 0) - (favorites.counts[a.id] || 0));

  return (
    <div className="space-y-6">
      <section className="admin-surface overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="relative min-h-[220px] border-b border-border/80 bg-zinc-200 lg:min-h-[280px] lg:border-r lg:border-b-0">
            {cover?.mediaType === "photo" ? (
              <Image src={cover.url} alt={detail.project.title} fill className="object-cover" unoptimized />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white">
              <p className="text-[10px] tracking-[0.28em] uppercase text-white/85">Gallery Manager</p>
              <h2 className="title-cinematic mt-2 text-3xl font-semibold">{detail.project.title}</h2>
            </div>
          </div>

          <div className="flex flex-col p-5 lg:p-6">
            <p className="quiet-label">Gallery Summary</p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 px-3 py-2">
                <p className="text-xs text-muted-foreground">Total media</p>
                <p className="mt-1 font-medium">{mediaWithUrl.length}</p>
              </div>
              <div className="rounded-xl border border-border/70 px-3 py-2">
                <p className="text-xs text-muted-foreground">Scenes</p>
                <p className="mt-1 font-medium">{detail.sections.length}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/g/${detail.gallery.slug}`}
                className="inline-flex rounded-full border border-foreground bg-foreground px-4 py-2 text-sm text-background transition hover:opacity-90"
              >
                Preview Gallery
              </Link>
              <form action={addDemoMediaAction}>
                <input type="hidden" name="galleryId" value={detail.gallery.id} />
                <button
                  type="submit"
                  className="inline-flex rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30"
                >
                  Add demo image
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="admin-surface p-5">
          <h3 className="quiet-label mb-3">Gallery Settings</h3>
          <form action={updateGallerySettingsAction} className="space-y-4">
            <input type="hidden" name="galleryId" value={detail.gallery.id} />

            <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <span className="text-sm">Published</span>
              <input name="isPublished" type="checkbox" defaultChecked={detail.gallery.isPublished} />
            </label>

            <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <span className="text-sm">Allow downloads</span>
              <input name="allowDownloads" type="checkbox" defaultChecked={detail.gallery.allowDownloads} />
            </label>

            <div className="space-y-2">
              <label htmlFor="passcode" className="text-sm">
                Gallery passcode
              </label>
              <input
                id="passcode"
                name="passcode"
                type="text"
                className="h-10 w-full rounded-xl border border-border px-3 text-sm"
                placeholder="Leave empty to keep current"
              />
            </div>

            <button type="submit" className="h-10 rounded-full border border-foreground bg-foreground px-4 text-sm text-background transition hover:opacity-90">
              Save settings
            </button>
          </form>
        </article>

        <article className="admin-surface p-5">
          <h3 className="quiet-label mb-3">Scenes / Sections</h3>
          <ul className="mb-4 space-y-2">
            {detail.sections.map((section) => (
              <SectionRow key={section.id} section={section} galleryId={detail.gallery.id} />
            ))}
          </ul>

          <form action={createGallerySectionAction} className="flex gap-2">
            <input type="hidden" name="galleryId" value={detail.gallery.id} />
            <input
              name="name"
              required
              placeholder="New section name"
              className="h-10 flex-1 rounded-xl border border-border px-3 text-sm"
            />
            <button type="submit" className="h-10 rounded-xl border border-border px-4 text-sm hover:border-foreground/30">
              Add
            </button>
          </form>
        </article>
      </section>

      <section className="admin-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="title-cinematic text-xl font-semibold">Client Favorites</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Photos your clients hearted in the gallery, most-loved first.
            </p>
          </div>
          <div className="flex gap-2 text-center">
            <div className="rounded-xl border border-border/70 px-3 py-2">
              <p className="text-xs text-muted-foreground">Favorited</p>
              <p className="mt-1 font-medium">{favoritedMedia.length}</p>
            </div>
            <div className="rounded-xl border border-border/70 px-3 py-2">
              <p className="text-xs text-muted-foreground">Clients</p>
              <p className="mt-1 font-medium">{favorites.guests}</p>
            </div>
          </div>
        </div>

        {favoritedMedia.length === 0 ? (
          <p className="mt-5 border-t border-border/70 pt-5 text-sm text-muted-foreground">
            No favorites yet. They will appear here once clients heart photos in the gallery.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border/70 pt-5 sm:grid-cols-4 md:grid-cols-6">
            {favoritedMedia.map((asset) => (
              <div key={asset.id} className="group relative aspect-square overflow-hidden rounded-xl bg-zinc-200">
                {asset.mediaType === "photo" ? (
                  <Image src={asset.url} alt="Favorited media" fill className="object-cover" unoptimized />
                ) : (
                  <video src={asset.url} className="h-full w-full object-cover" preload="metadata" />
                )}
                <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                  <span className="text-rose-400">&#9829;</span>
                  {favorites.counts[asset.id]}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-surface p-5">
        <h3 className="title-cinematic text-xl font-semibold">Files</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload, organize, set covers, and manage all media for this gallery.
        </p>

        <div className="mt-5 border-t border-border/70 pt-5">
          <p className="quiet-label mb-3">Upload Media</p>
          <MediaUploader galleryId={detail.gallery.id} sections={detail.sections} />
        </div>

        <div className="mt-5 border-t border-border/70 pt-5">
          <p className="quiet-label mb-3">Media Library</p>
          <MediaManager media={mediaWithUrl} sections={detail.sections} galleryId={detail.gallery.id} />
        </div>
      </section>
    </div>
  );
}