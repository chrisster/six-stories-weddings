import Link from "next/link";
import { Images } from "lucide-react";

import { ProjectsControls } from "@/components/admin/projects-controls";
import { getGalleries, getProjects } from "@/lib/data";
import { formatDateDDMMYY } from "@/lib/utils";

type AdminPageProps = {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; period?: string }>;
};

function statusLabel(status: string) {
  if (status === "post_production") return "post production";
  return status.replace("_", " ");
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    scheduled: "bg-emerald-100 text-emerald-800",
    post_production: "bg-indigo-100 text-indigo-700",
    completed: "bg-teal-100 text-teal-700",
    negotiating: "bg-sky-100 text-sky-800",
    draft: "bg-zinc-100 text-zinc-600",
    cancelled: "bg-rose-100 text-rose-700",
    declined: "bg-orange-100 text-orange-700",
  };
  return map[status] || "bg-muted text-muted-foreground";
}

const statusKpis = [
  { key: "all", label: "Total" },
  { key: "draft", label: "Draft" },
  { key: "negotiating", label: "Negotiating" },
  { key: "scheduled", label: "Scheduled" },
  { key: "post_production", label: "Post-Production" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "declined", label: "Declined" },
] as const;

function isWithinPeriod(eventDate: string, period: string) {
  if (period === "all") return true;

  const date = new Date(`${eventDate}T00:00:00Z`);
  const now = new Date();

  if (period === "this_month") {
    return (
      date.getUTCFullYear() === now.getUTCFullYear() &&
      date.getUTCMonth() === now.getUTCMonth()
    );
  }

  if (period === "this_year") {
    return date.getUTCFullYear() === now.getUTCFullYear();
  }

  return true;
}

function eventTypeText(projectType: string): string {
  const type = projectType.toLowerCase();
  if (type.includes("baptism")) return "Baptism";
  return "Wedding";
}

export default async function AdminOverviewPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const q = (params.q || "").toLowerCase();
  const statusFilter = params.status || "all";
  const sort = params.sort || "date_desc";
  const period = params.period || "all";

  const projects = await getProjects();
  const galleries = await getGalleries();
  const galleryByProject = new Map(galleries.map((gallery) => [gallery.projectId, gallery]));

  const periodFiltered = projects.filter((project) => isWithinPeriod(project.eventDate, period));

  const filtered = periodFiltered
    .filter((project) => {
    const matchesText =
      q.length === 0 ||
      project.title.toLowerCase().includes(q) ||
      project.clients.some((c) => c.fullName.toLowerCase().includes(q));
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesText && matchesStatus;
    })
    .sort((a, b) => {
      if (sort === "name_asc") return a.title.localeCompare(b.title);
      if (sort === "name_desc") return b.title.localeCompare(a.title);
      if (sort === "date_asc") return a.eventDate.localeCompare(b.eventDate);
      if (sort === "status_asc") return a.status.localeCompare(b.status);
      return b.eventDate.localeCompare(a.eventDate);
    });

  const statusCounts: Record<string, number> = {
    all: periodFiltered.length,
    draft: periodFiltered.filter((project) => project.status === "draft").length,
    negotiating: periodFiltered.filter((project) => project.status === "negotiating").length,
    scheduled: periodFiltered.filter((project) => project.status === "scheduled").length,
    post_production: periodFiltered.filter((project) => project.status === "post_production").length,
    completed: periodFiltered.filter((project) => project.status === "completed").length,
    cancelled: periodFiltered.filter((project) => project.status === "cancelled").length,
    declined: periodFiltered.filter((project) => project.status === "declined").length,
  };

  return (
    <div className="space-y-5">
      <section className="admin-surface p-4">
        <p className="quiet-label mb-3">Overview</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statusKpis.map((kpi) => (
            <article
              key={kpi.key}
              className="rounded-2xl border border-border/80 bg-zinc-50 px-4 py-3"
            >
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{kpi.label}</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{statusCounts[kpi.key] || 0}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-surface p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="title-cinematic text-2xl font-semibold">Projects</h2>
          <Link
            href="/admin/projects/new"
            className="h-9 rounded-xl border border-foreground bg-foreground px-4 py-2 text-sm text-background transition hover:opacity-90"
          >
            Add project
          </Link>
        </div>

        <ProjectsControls
          initialQuery={params.q || ""}
          initialStatus={statusFilter}
          initialSort={sort}
          initialPeriod={period}
          statusOptions={[...statusKpis]}
          statusCounts={statusCounts}
        />

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">No projects found.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((project) => {
              const gallery = galleryByProject.get(project.id);
              const galleryHref = gallery
                ? gallery.isPublished
                  ? `/g/${gallery.slug}`
                  : `/admin/galleries/${gallery.id}`
                : null;
              return (
                <div
                  key={project.id}
                  className="group relative overflow-hidden rounded-2xl border border-border/80 bg-white shadow-sm transition hover:border-foreground/30 hover:shadow-[0_16px_38px_-24px_rgba(0,0,0,0.42)]"
                >
                  <Link
                    href={`/admin/projects/${project.id}`}
                    aria-label={`Open ${project.title}`}
                    className="absolute inset-0 z-[1]"
                  />
                  <div className="relative h-40 w-full overflow-hidden bg-zinc-200">
                    {project.coverImageUrl ? (
                      <img
                        src={project.coverImageUrl}
                        alt={project.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : null}
                  </div>
                  <div className="p-6">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="title-cinematic truncate text-lg font-semibold leading-snug group-hover:text-foreground">
                          {project.title}
                        </h3>
                        {galleryHref ? (
                          <Link
                            href={galleryHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Preview gallery"
                            aria-label="Preview gallery"
                            className="relative z-[2] inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
                          >
                            <Images className="size-4" />
                          </Link>
                        ) : (
                          <span
                            title="No gallery yet"
                            aria-label="No gallery yet"
                            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground/40"
                          >
                            <Images className="size-4" />
                          </span>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-xs capitalize leading-tight ${statusBadge(project.status)}`}
                      >
                        {statusLabel(project.status)}
                      </span>
                    </div>

                    <div className="mb-4 space-y-1.5 text-sm text-muted-foreground">
                      <p className="text-xs text-foreground/80">{formatDateDDMMYY(project.eventDate)}</p>
                      <p className="text-xs text-muted-foreground">{eventTypeText(project.projectType)}</p>
                    </div>

                    <div className="text-xs text-muted-foreground group-hover:text-foreground/70">
                      View details →
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}