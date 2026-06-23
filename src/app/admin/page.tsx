import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
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
    confirmed: "bg-emerald-100 text-emerald-800",
    negotiating: "bg-sky-100 text-sky-800",
    unconfirmed: "bg-yellow-100 text-yellow-800",
    draft: "bg-zinc-100 text-zinc-500",
    declined: "bg-red-100 text-red-700",
    cancelled: "bg-red-100 text-red-700",
  };
  return map[status] || "bg-muted text-muted-foreground";
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

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total" value={String(metrics.totalProjects)} />
        <MetricCard label="Confirmed" value={String(metrics.confirmedProjects)} />
        <MetricCard label="Upcoming" value={String(metrics.upcomingProjects)} />
        <MetricCard label="Unconfirmed" value={String(metrics.unconfirmedProjects)} />
      </section>

      <section className="soft-panel p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="title-cinematic text-2xl font-semibold">Projects</h2>
          <Link
            href="/admin/projects/new"
            className="h-9 rounded-xl border border-foreground bg-foreground px-4 py-2 text-sm text-background"
          >
            Add project
          </Link>
        </div>

        <form className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
          <input
            type="search"
            name="q"
            defaultValue={params.q}
            placeholder="Search by couple or project"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="negotiating">Negotiating</option>
            <option value="unconfirmed">Unconfirmed</option>
            <option value="draft">Draft</option>
            <option value="declined">Declined</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            type="submit"
            className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background"
          >
            Filter
          </button>
        </form>
      </section>

      <section>
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-border/80 bg-white/80 px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">No projects found.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((project) => (
              <Link
                key={project.id}
                href={`/admin/projects/${project.id}`}
                className="group rounded-2xl border border-border/70 bg-white/85 p-6 shadow-sm transition hover:border-foreground/30 hover:shadow-[0_12px_40px_-20px_rgba(0,0,0,0.25)]"
              >
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
                  <p className="font-medium text-foreground">
                    {project.clients.map((c) => c.fullName).join(" & ") || "—"}
                  </p>
                  <p className="text-xs">
                    <span className="inline-block w-12 text-muted-foreground">Date:</span>
                    {formatDateDDMMYY(project.eventDate)}
                  </p>
                  {project.projectType && (
                    <p className="text-xs">
                      <span className="inline-block w-12 text-muted-foreground">Type:</span>
                      {project.projectType}
                    </p>
                  )}
                </div>

                <div className="text-xs text-muted-foreground group-hover:text-foreground/70">
                  View details →
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}