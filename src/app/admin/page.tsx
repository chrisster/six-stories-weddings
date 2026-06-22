import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { getDashboardMetrics, getProjects } from "@/lib/data";

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    value,
  );
}

export default async function AdminOverviewPage() {
  const [metrics, projects] = await Promise.all([getDashboardMetrics(), getProjects()]);
  const nextProjects = projects.slice(0, 5);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Projects" value={String(metrics.totalProjects)} />
        <MetricCard label="Confirmed" value={String(metrics.confirmedProjects)} />
        <MetricCard label="Upcoming" value={String(metrics.upcomingProjects)} />
        <MetricCard label="Unconfirmed" value={String(metrics.unconfirmedProjects)} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Budget" value={currency(metrics.totalBudget)} />
        <MetricCard label="Paid" value={currency(metrics.totalPaid)} />
        <MetricCard label="Remaining" value={currency(metrics.totalRemaining)} />
      </section>

      <section className="soft-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="title-cinematic text-2xl font-semibold">Upcoming Weddings</h2>
          <Link href="/admin/projects" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            View all projects
          </Link>
        </div>

        <ul className="space-y-2">
          {nextProjects.map((project) => (
            <li key={project.id} className="rounded-xl border border-border/80 bg-white/75 p-3">
              <Link href={`/admin/projects/${project.id}`} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{project.title}</p>
                  <p className="text-xs text-muted-foreground">{project.eventDate}</p>
                </div>
                <p className="text-sm capitalize text-muted-foreground">{project.status}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}