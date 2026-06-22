import Link from "next/link";
import { notFound } from "next/navigation";

import { getGalleries, getProjectById } from "@/lib/data";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    value,
  );
}

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    notFound();
  }

  const galleries = await getGalleries();
  const linkedGallery = galleries.find((gallery) => gallery.projectId === project.id);

  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Project</p>
            <h2 className="title-cinematic mt-2 text-3xl font-semibold">{project.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {project.eventDate} · {project.projectType}
            </p>
          </div>
          {linkedGallery ? (
            <Link
              href={`/admin/galleries/${linkedGallery.id}`}
              className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30"
            >
              Open Gallery Manager
            </Link>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="soft-panel p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Clients</h3>
          <ul className="space-y-2">
            {project.clients.map((client) => (
              <li key={client.id} className="rounded-xl border border-border/80 bg-white/80 px-3 py-2">
                <p className="font-medium">{client.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  {client.email || "No email"} · {client.phone || "No phone"}
                </p>
              </li>
            ))}
          </ul>
        </article>

        <article className="soft-panel p-5">
          <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Budget</h3>
          <div className="space-y-2 text-sm">
            <p className="flex items-center justify-between">
              <span>Total</span>
              <span className="font-medium">{currency(project.budgetTotal)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>Paid</span>
              <span className="font-medium">{currency(project.amountPaid)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>Remaining</span>
              <span className="font-medium">{currency(project.amountRemaining)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>Status</span>
              <span className="font-medium capitalize">{project.status}</span>
            </p>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="soft-panel p-5">
          <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Crew</h3>
          <ul className="space-y-2">
            {project.crewAssignments.map((assignment) => (
              <li key={assignment.id} className="rounded-xl border border-border/70 px-3 py-2">
                <p className="font-medium">{assignment.crewMember.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  {assignment.assignmentRole} · {assignment.crewMember.roleType}
                </p>
              </li>
            ))}
          </ul>
        </article>

        <article className="soft-panel p-5">
          <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Tasks</h3>
          <ul className="space-y-2">
            {project.tasks.map((task) => (
              <li key={task.id} className="rounded-xl border border-border/70 px-3 py-2">
                <p className="font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {task.status.replace("_", " ")} · {task.priority} priority
                </p>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="soft-panel p-5">
        <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Deliverables</h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {project.deliverables.map((deliverable) => (
            <li key={deliverable.id} className="rounded-xl border border-border/70 px-3 py-2">
              <p className="font-medium capitalize">{deliverable.deliverableType.replace("_", " ")}</p>
              <p className="text-xs text-muted-foreground capitalize">{deliverable.status.replace("_", " ")}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}