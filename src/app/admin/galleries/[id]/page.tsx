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
import { getGalleryById } from "@/lib/data";
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
  return (
    <div className="space-y-6">
      <section className="admin-surface overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="relative min-h-[220px] border-b border-border/80 bg-zinc-200 lg:min-h-[280px] lg:border-r lg:border-b-0">
            {cover?.mediaType === "photo" ? (
              <Image src={cover.url} alt={detail.gallery.title} fill className="object-cover" unoptimized />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white">
              <p className="text-[10px] tracking-[0.28em] uppercase text-white/85">Gallery Manager</p>
              <h2 className="title-cinematic mt-2 text-3xl font-semibold">{detail.gallery.title}</h2>
              <p className="mt-1 text-sm text-white/90">{detail.project.title}</p>
            </div>
          </div>

          <div className="p-5 lg:p-6">
            <p className="quiet-label">Quick Actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/g/${detail.gallery.slug}`}
                className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30"
              >
                Open public gallery
              </Link>
              <form action={addDemoMediaAction}>
                <input type="hidden" name="galleryId" value={detail.gallery.id} />
                <button
                  type="submit"
                  className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30"
                >
                  Add demo image
                </button>
              </form>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Upload path format: <span className="font-mono">galleryId/uuid.ext</span>
            </p>
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
        <h3 className="quiet-label mb-3">Upload Media</h3>
        <MediaUploader galleryId={detail.gallery.id} sections={detail.sections} />
      </section>

      <section className="space-y-4">
        <div className="admin-surface p-5">
          <h3 className="quiet-label">Media Library</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Organize media by scenes, set covers, and remove files as needed.
          </p>
        </div>

        <MediaManager media={mediaWithUrl} sections={detail.sections} galleryId={detail.gallery.id} />
      </section>
    </div>
  );
}