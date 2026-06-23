import Link from "next/link";

import { getDashboardMetrics, getProjects } from "@/lib/data";
import { formatDateDDMMYY } from "@/lib/utils";

type AdminPageProps = {
  searchParams: Promise<{ q?: string; status?: string }>;
};

function statusLabel(status: string) {
  return status.replace("_", " ");
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    scheduled: "bg-emerald-100 text-emerald-800",
    post_production: "bg-indigo-100 text-indigo-700",
    negotiating: "bg-sky-100 text-sky-800",
    draft: "bg-zinc-100 text-zinc-600",
    cancelled: "bg-rose-100 text-rose-700",
    declined: "bg-red-100 text-red-700",
  };
  return map[status] || "bg-muted text-muted-foreground";
}

const statusPills = [
  { key: "all", label: "Total", cls: "border-zinc-300 bg-zinc-100 text-zinc-700" },
  { key: "draft", label: "Draft", cls: "border-zinc-300 bg-zinc-100 text-zinc-700" },
  { key: "negotiating", label: "Negotiating", cls: "border-sky-300 bg-sky-100 text-sky-700" },
  { key: "scheduled", label: "Scheduled", cls: "border-emerald-300 bg-emerald-100 text-emerald-700" },
  {
    key: "post_production",
    label: "Post-Production",
    cls: "border-indigo-300 bg-indigo-100 text-indigo-700",
  },
  { key: "cancelled", label: "Cancelled", cls: "border-rose-300 bg-rose-100 text-rose-700" },
  { key: "declined", label: "Declined", cls: "border-red-300 bg-red-100 text-red-700" },
] as const;

function serviceTags(projectType: string): string[] {
  const type = projectType.toLowerCase();
  const tags: string[] = [];
  if (type.includes("photo")) tags.push("Photography");
  if (type.includes("film") || type.includes("video")) tags.push("Film");
  if (type.includes("baptism")) tags.push("Baptism");
  if (type.includes("wedding")) tags.push("Wedding");
  return [...new Set(tags)];
}

export default async function AdminOverviewPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const q = (params.q || "").toLowerCase();
  const statusFilter = params.status || "all";

  const [metrics, projects] = await Promise.all([getDashboardMetrics(), getProjects()]);

  const filtered = projects.filter((project) => {
    const matchesText =
      q.length === 0 ||
      project.title.toLowerCase().includes(q) ||
      project.clients.some((c) => c.fullName.toLowerCase().includes(q));
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesText && matchesStatus;
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
        <p className="quiet-label mb-3">Project Statuses</p>
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

        <form className="mb-4 grid gap-3">
          <input
            type="search"
            name="q"
            defaultValue={params.q}
            placeholder="Search by couple"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />

          <div className="flex flex-wrap gap-2">
            {statusPills.map((pill) => (
              <button
                key={pill.key}
                type="submit"
                name="status"
                value={pill.key}
                className={`rounded-full border px-3 py-1 text-sm transition ${pill.cls} ${
                  statusFilter === pill.key ? "ring-1 ring-foreground/35" : "opacity-85 hover:opacity-100"
                }`}
              >
                {pill.label} ({statusCounts[pill.key] || 0})
              </button>
            ))}
          </div>
        </form>

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
                    <div className="space-y-0.5">
                      <h3 className="title-cinematic text-lg font-semibold leading-snug group-hover:text-foreground">
                        {project.clients[0]?.fullName || "Groom"}
                      </h3>
                      <p className="title-cinematic text-base leading-snug text-foreground/85">
                        {project.clients[1]?.fullName || "Bride"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs capitalize leading-tight ${statusBadge(project.status)}`}
                    >
                      {statusLabel(project.status)}
                    </span>
                  </div>

                  <div className="mb-4 space-y-1.5 text-sm text-muted-foreground">
                    <p className="text-xs text-foreground/80">{formatDateDDMMYY(project.eventDate)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {serviceTags(project.projectType).map((tag) => (
                        <span key={tag} className="rounded-full border border-border bg-white px-2 py-0.5 text-[11px] text-foreground/80">
                          {tag}
                        </span>
                      ))}
                    </div>
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