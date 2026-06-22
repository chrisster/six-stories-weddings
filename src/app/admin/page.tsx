import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { getDashboardMetrics, getProjects } from "@/lib/data";

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

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-white/80">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No projects found.</p>
        ) : (
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Clients</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Services</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => (
                <tr key={project.id} className="border-b border-border/70 last:border-b-0 hover:bg-muted/20">
                  <td className="px-4 py-3 align-top text-sm text-muted-foreground">{project.eventDate}</td>
                  <td className="px-4 py-3 align-top">
                    <Link href={`/admin/projects/${project.id}`} className="font-medium hover:underline">
                      {project.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {project.clients.map((c) => c.fullName).join(" & ") || "—"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-block rounded-lg px-2 py-0.5 text-xs capitalize ${statusBadge(project.status)}`}
                    >
                      {statusLabel(project.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">{project.projectType || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}