import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addClientToProjectAction,
  updateClientAction,
  updateProjectAction,
} from "@/app/admin/projects/actions";
import { DeleteProjectButton } from "@/components/admin/delete-project-button";
import { getGalleries, getProjectById } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/env";

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
          <div className="flex flex-wrap items-center gap-2">
            {linkedGallery ? (
              <Link
                href={`/admin/galleries/${linkedGallery.id}`}
                className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30"
              >
                Open Gallery Manager
              </Link>
            ) : null}
            <DeleteProjectButton projectId={project.id} projectTitle={project.title} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="soft-panel p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Clients</h3>
          <ul className="space-y-3">
            {project.clients.map((client) => (
              <li key={client.id} className="rounded-xl border border-border/80 bg-white/80 px-3 py-3">
                <form action={updateClientAction} className="grid gap-2 sm:grid-cols-3">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="clientId" value={client.id} />
                  <input
                    name="fullName"
                    defaultValue={client.fullName}
                    required
                    className="h-10 rounded-xl border border-border px-3 text-sm"
                  />
                  <input
                    name="email"
                    type="email"
                    defaultValue={client.email || ""}
                    placeholder="Email"
                    className="h-10 rounded-xl border border-border px-3 text-sm"
                  />
                  <input
                    name="phone"
                    defaultValue={client.phone || ""}
                    placeholder="Phone"
                    className="h-10 rounded-xl border border-border px-3 text-sm"
                  />
                  <button type="submit" className="h-10 rounded-xl border border-border px-3 text-sm sm:col-span-3 sm:justify-self-start">
                    Save client
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <form action={addClientToProjectAction} className="mt-4 grid gap-2 rounded-xl border border-border/80 p-3 sm:grid-cols-3">
            <input type="hidden" name="projectId" value={project.id} />
            <input name="fullName" placeholder="Add client name" required className="h-10 rounded-xl border border-border px-3 text-sm" />
            <input name="email" type="email" placeholder="Email" className="h-10 rounded-xl border border-border px-3 text-sm" />
            <input name="phone" placeholder="Phone" className="h-10 rounded-xl border border-border px-3 text-sm" />
            <button type="submit" className="h-10 rounded-xl border border-border px-3 text-sm sm:col-span-3 sm:justify-self-start">
              Add client
            </button>
          </form>
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

      <section className="soft-panel p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Edit Wedding Details</h3>
          {!hasSupabaseEnv ? <p className="text-xs text-muted-foreground">Read-only in demo mode.</p> : null}
        </div>
        <form action={updateProjectAction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input name="title" required defaultValue={project.title} className="h-10 rounded-xl border border-border px-3 text-sm" />
          <input
            name="eventDate"
            type="date"
            required
            defaultValue={project.eventDate}
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <input name="projectType" defaultValue={project.projectType} className="h-10 rounded-xl border border-border px-3 text-sm" />
          <select name="status" defaultValue={project.status} className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value="draft">Draft</option>
            <option value="negotiating">Negotiating</option>
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Unconfirmed</option>
            <option value="declined">Declined</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            name="editingStatus"
            defaultValue={project.editingStatus}
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          >
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="review">Review</option>
            <option value="completed">Completed</option>
          </select>
          <input
            name="budgetTotal"
            type="number"
            min="0"
            step="0.01"
            defaultValue={project.budgetTotal}
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <input
            name="amountPaid"
            type="number"
            min="0"
            step="0.01"
            defaultValue={project.amountPaid}
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <input
            name="notes"
            defaultValue={project.notes || ""}
            placeholder="Notes"
            className="h-10 rounded-xl border border-border px-3 text-sm sm:col-span-2"
          />

          <button type="submit" className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background xl:justify-self-start">
            Save wedding
          </button>
        </form>
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