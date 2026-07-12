import Link from "next/link";
import { Download, Eye } from "lucide-react";

import { getCurrentUser, getCurrentUserRole } from "@/lib/auth";
import { getAssignedProjectIdsForEmail, getGalleries, getGalleryEventStats, getProjectById } from "@/lib/data";

function displayName(projectTitle: string | undefined, galleryTitle: string): string {
  if (projectTitle && projectTitle.trim()) {
    return projectTitle;
  }
  return galleryTitle.replace(/\s*gallery\s*$/i, "").trim() || galleryTitle;
}

export default async function GalleriesPage() {
  const allGalleries = await getGalleries();

  let galleries = allGalleries;
  if ((await getCurrentUserRole()) === "crew") {
    const user = await getCurrentUser();
    const assignedIds = new Set(await getAssignedProjectIdsForEmail(user?.email || ""));
    galleries = allGalleries.filter((gallery) => assignedIds.has(gallery.projectId));
  }

  const eventStats = await getGalleryEventStats(galleries.map((gallery) => gallery.id));
  const galleryWithProject = await Promise.all(
    galleries.map(async (gallery) => ({
      gallery,
      project: await getProjectById(gallery.projectId),
    })),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {galleryWithProject.map(({ gallery, project }) => {
        const name = displayName(project?.title, gallery.title);
        const stats = eventStats.byGallery[gallery.id] || { views: 0, downloads: 0, viewers: 0 };

        return (
          <article
            key={gallery.id}
            className="group overflow-hidden rounded-2xl border border-border/80 bg-white shadow-sm transition hover:border-foreground/30 hover:shadow-[0_16px_38px_-24px_rgba(0,0,0,0.42)]"
          >
            <Link href={`/admin/galleries/${gallery.id}`} className="block">
              <div className="relative h-40 w-full overflow-hidden bg-zinc-200">
                {project?.coverImageUrl ? (
                  <img
                    src={project.coverImageUrl}
                    alt={name}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : null}
              </div>
            </Link>

            <div className="p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="title-cinematic text-lg font-semibold leading-snug">{name}</h3>
                <span
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs leading-tight ${
                    gallery.isPublished
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {gallery.isPublished ? "Published" : "Draft"}
                </span>
              </div>

              <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5" title={`${stats.viewers} unique visitors`}>
                  <Eye className="size-3.5" />
                  {stats.views} view{stats.views === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Download className="size-3.5" />
                  {stats.downloads} download{stats.downloads === 1 ? "" : "s"}
                </span>
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
        );
      })}
    </div>
  );
}