import Link from "next/link";

import { ProjectsControls } from "@/components/admin/projects-controls";
import { getDashboardMetrics, getProjects } from "@/lib/data";
import { formatDateDDMMYY } from "@/lib/utils";

type AdminPageProps = {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
};

function statusLabel(status: string) {
  if (status === "post_production") return "post production";
  return status.replace("_", " ");
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    scheduled: "bg-emerald-100 text-emerald-800",
    post_production: "bg-indigo-100 text-indigo-700",
    negotiating: "bg-sky-100 text-sky-800",
    draft: "bg-zinc-100 text-zinc-600",
    cancelled: "bg-rose-100 text-rose-700",
    declined: "bg-orange-100 text-orange-700",
  };
  return map[status] || "bg-muted text-muted-foreground";
}

const statusPills = [
  { key: "all", label: "Total", cls: "border-amber-300 bg-amber-100 text-amber-800" },
  { key: "draft", label: "Draft", cls: "border-zinc-300 bg-zinc-100 text-zinc-700" },
  { key: "negotiating", label: "Negotiating", cls: "border-sky-300 bg-sky-100 text-sky-700" },
  { key: "scheduled", label: "Scheduled", cls: "border-emerald-300 bg-emerald-100 text-emerald-700" },
  {
    key: "post_production",
    label: "Post-Production",
    cls: "border-indigo-300 bg-indigo-100 text-indigo-700",
  },
  { key: "cancelled", label: "Cancelled", cls: "border-rose-300 bg-rose-100 text-rose-700" },
  { key: "declined", label: "Declined", cls: "border-orange-300 bg-orange-100 text-orange-700" },
] as const;

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

  const [metrics, projects] = await Promise.all([getDashboardMetrics(), getProjects()]);

  const filtered = projects.filter((project) => {
    const matchesText =
      q.length === 0 ||
      project.title.toLowerCase().includes(q) ||
      project.clients.some((c) => c.fullName.toLowerCase().includes(q));
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesText && matchesStatus;
  }).sort((a, b) => {
    if (sort === "name_asc") return a.title.localeCompare(b.title);
    if (sort === "name_desc") return b.title.localeCompare(a.title);
    if (sort === "date_asc") return a.eventDate.localeCompare(b.eventDate);
    if (sort === "status_asc") return a.status.localeCompare(b.status);
    return b.eventDate.localeCompare(a.eventDate);
  });

  const statusCounts: Record<string, number> = {
    all: metrics.totalProjects,
    draft: metrics.draftProjects,
    negotiating: metrics.negotiatingProjects,
    scheduled: metrics.scheduledProjects,
    post_production: metrics.postProductionProjects,
    cancelled: metrics.cancelledProjects,
    declined: metrics.declinedProjects,
  };

  return (
    <div className="space-y-5">
      <section className="admin-surface p-4">
        <p className="quiet-label mb-3">Overview</p>
        <div className="flex flex-wrap gap-2">
          {statusPills.map((pill) => (
            <span
              key={pill.key}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${pill.cls}`}
            >
              {pill.label} ({statusCounts[pill.key] || 0})
            </span>
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
          statusPills={[...statusPills]}
          statusCounts={statusCounts}
        />

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">No projects found.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((project) => (
              <Link
                key={project.id}
                href={`/admin/projects/${project.id}`}
                className="group overflow-hidden rounded-2xl border border-border/80 bg-white shadow-sm transition hover:border-foreground/30 hover:shadow-[0_16px_38px_-24px_rgba(0,0,0,0.42)]"
              >
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
                    <h3 className="title-cinematic text-lg font-semibold leading-snug group-hover:text-foreground">
                      {project.title}
                    </h3>
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
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}