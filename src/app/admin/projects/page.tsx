import Link from "next/link";

import { createProjectAction } from "@/app/admin/projects/actions";
import { hasSupabaseEnv } from "@/lib/env";
import { getProjects } from "@/lib/data";

type ProjectsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    value,
  );
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams;
  const q = (params.q || "").toLowerCase();
  const status = params.status || "all";

  const projects = await getProjects();
  const filtered = projects.filter((project) => {
    const matchesText =
      q.length === 0 ||
      project.title.toLowerCase().includes(q) ||
      project.clients.some((client) => client.fullName.toLowerCase().includes(q));

    const matchesStatus = status === "all" || project.status === status;
    return matchesText && matchesStatus;
  });

  return (
    <div className="space-y-5">
      <section className="soft-panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Add Wedding</h2>
          {!hasSupabaseEnv ? <p className="text-xs text-muted-foreground">Configure Supabase to save new weddings.</p> : null}
        </div>
        <form action={createProjectAction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input
            name="title"
            required
            placeholder="Project title"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <input name="eventDate" type="date" required className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <input
            name="projectType"
            defaultValue="Wedding"
            placeholder="Type"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <select name="status" defaultValue="unconfirmed" className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Unconfirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            name="editingStatus"
            defaultValue="not_started"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          >
            <option value="not_started">Editing: Not Started</option>
            <option value="in_progress">Editing: In Progress</option>
            <option value="review">Editing: Review</option>
            <option value="completed">Editing: Completed</option>
          </select>
          <input
            name="budgetTotal"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            placeholder="Budget total"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <input
            name="amountPaid"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            placeholder="Amount paid"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <input
            name="clientName"
            placeholder="Primary client name"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <input
            name="clientEmail"
            type="email"
            placeholder="Client email"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <input
            name="clientPhone"
            placeholder="Client phone"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <input
            name="notes"
            placeholder="Notes"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm sm:col-span-2"
          />

          <button
            type="submit"
            className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background xl:justify-self-start"
          >
            Create wedding
          </button>
        </form>
      </section>

      <section className="soft-panel p-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <input
            type="search"
            name="q"
            defaultValue={params.q}
            placeholder="Search by couple or project"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <select
            name="status"
            defaultValue={status}
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Unconfirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button type="submit" className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background">
            Apply
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-white/80">
        <table className="w-full min-w-[780px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Clients</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((project) => (
              <tr key={project.id} className="border-b border-border/70 last:border-b-0">
                <td className="px-4 py-3 align-top">{project.eventDate}</td>
                <td className="px-4 py-3 align-top">
                  <Link href={`/admin/projects/${project.id}`} className="font-medium hover:underline">
                    {project.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">{project.projectType}</p>
                </td>
                <td className="px-4 py-3 align-top">{project.clients.map((client) => client.fullName).join(" / ")}</td>
                <td className="px-4 py-3 align-top capitalize">{project.status}</td>
                <td className="px-4 py-3 align-top">{currency(project.budgetTotal)}</td>
                <td className="px-4 py-3 align-top">{currency(project.amountPaid)}</td>
                <td className="px-4 py-3 align-top">{currency(project.amountRemaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}