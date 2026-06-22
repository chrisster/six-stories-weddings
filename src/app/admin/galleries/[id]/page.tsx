import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createGallerySectionAction,
  setCoverMediaAction,
  updateGallerySettingsAction,
  uploadMediaAction,
} from "@/app/admin/galleries/[id]/actions";
import { getGalleryById } from "@/lib/data";
import { getSignedMediaUrl } from "@/lib/storage";

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
    detail.mediaAssets.map(async (asset) => ({
      ...asset,
      url: await getSignedMediaUrl(asset.storagePath),
    })),
  );

  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">Gallery Manager</p>
        <h2 className="title-cinematic mt-2 text-3xl font-semibold">{detail.gallery.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Project: {detail.project.title}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/g/${detail.gallery.slug}`}
            className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30"
          >
            Open public gallery
          </Link>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="soft-panel p-5">
          <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Gallery Settings</h3>
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
                Gallery passcode (leave empty to keep current)
              </label>
              <input
                id="passcode"
                name="passcode"
                type="text"
                className="h-10 w-full rounded-xl border border-border px-3 text-sm"
                placeholder="Set or update passcode"
              />
            </div>

            <button type="submit" className="h-10 rounded-full border border-foreground bg-foreground px-4 text-sm text-background">
              Save settings
            </button>
          </form>
        </article>

        <article className="soft-panel p-5">
          <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Sections</h3>
          <ul className="mb-4 space-y-2">
            {detail.sections.map((section) => (
              <li key={section.id} className="rounded-xl border border-border/70 px-3 py-2 text-sm">
                {section.name}
              </li>
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
            <button type="submit" className="h-10 rounded-xl border border-border px-4 text-sm">
              Add
            </button>
          </form>
        </article>
      </section>

      <section className="soft-panel p-5">
        <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Upload Media</h3>
        <form action={uploadMediaAction} className="grid gap-3 sm:grid-cols-[1fr_220px_auto]" encType="multipart/form-data">
          <input type="hidden" name="galleryId" value={detail.gallery.id} />
          <input
            type="file"
            name="files"
            accept="image/*,video/*"
            multiple
            required
            className="h-10 rounded-xl border border-border px-3 py-2 text-sm"
          />
          <select name="sectionId" className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value="">No section</option>
            {detail.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
          <button type="submit" className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background">
            Upload
          </button>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {mediaWithUrl.map((asset) => (
          <article key={asset.id} className="soft-panel overflow-hidden">
            <div className="relative aspect-[4/3] bg-muted/50">
              {asset.mediaType === "photo" ? (
                <Image src={asset.url} alt="Gallery asset" fill className="object-cover" unoptimized />
              ) : (
                <video src={asset.url} controls className="size-full object-cover" preload="metadata" />
              )}
            </div>
            <div className="flex items-center justify-between gap-2 p-3">
              <p className="text-xs text-muted-foreground">
                {asset.mediaType} {asset.isCover ? "· cover" : ""}
              </p>
              <form action={setCoverMediaAction}>
                <input type="hidden" name="galleryId" value={detail.gallery.id} />
                <input type="hidden" name="mediaId" value={asset.id} />
                <button type="submit" className="rounded-full border border-border px-3 py-1 text-xs">
                  Set cover
                </button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}