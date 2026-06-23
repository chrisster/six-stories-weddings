import Link from "next/link";

import { getGalleries, getProjectById } from "@/lib/data";

export default async function GalleriesPage() {
  const galleries = await getGalleries();
  const galleryWithProject = await Promise.all(
    galleries.map(async (gallery) => ({
      gallery,
      project: await getProjectById(gallery.projectId),
    })),
  );

  return (
    <div className="space-y-4">
      {galleryWithProject.map(({ gallery, project }) => (
        <article key={gallery.id} className="admin-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="quiet-label">Gallery</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight">{gallery.title}</h3>
              <p className="text-sm text-muted-foreground">{project?.title || "Unlinked project"}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/galleries/${gallery.id}`}
                className="rounded-full border border-border px-3 py-2 text-sm hover:border-foreground/30"
              >
                Manage
              </Link>
              <Link
                href={`/g/${gallery.slug}`}
                className="rounded-full border border-foreground bg-foreground px-3 py-2 text-sm text-background transition hover:opacity-90"
              >
                Open Public
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}