import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addDemoMediaAction,
  createGallerySectionAction,
  setCoverMediaAction,
  updateGallerySettingsAction,
  uploadMediaAction,
} from "@/app/admin/galleries/[id]/actions";
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
        <p className="mt-3 text-xs text-muted-foreground">
          Uploads are stored in Supabase Storage bucket <strong>wedding-media</strong>, path format:
          {" "}
          <span className="font-mono">galleryId/uuid.ext</span>.
        </p>
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
        {mediaWithUrl.length === 0 ? (
          <article className="soft-panel col-span-full p-6 text-sm text-muted-foreground">
            No media yet. Upload files above or click <strong>Add demo image</strong> to verify gallery rendering.
          </article>
        ) : null}
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
                {asset.mediaType} {asset.isCover ? "· cover" : ""} {asset.broken ? "· signed URL fallback" : ""}
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