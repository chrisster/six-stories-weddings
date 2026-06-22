import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addClientToProjectAction,
  addCrewToProjectAction,
  removeClientFromProjectAction,
  removeCrewFromProjectAction,
  updateClientAction,
  updateProjectAction,
} from "@/app/admin/projects/actions";
import { createTaskAction, deleteTaskAction, updateTaskStatusAction } from "@/app/admin/tasks/actions";
import { DeleteProjectButton } from "@/components/admin/delete-project-button";
import { getCrewMembers, getGalleries, getProjectById } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/env";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function toDisplayDate(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return iso;
}

const priorityBadge: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-500",
  medium: "bg-sky-100 text-sky-700",
  high: "bg-red-100 text-red-700",
};

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    notFound();
  }

  const [galleries, crewMembers] = await Promise.all([getGalleries(), getCrewMembers()]);
  const linkedGallery = galleries.find((gallery) => gallery.projectId === project.id);

  const assignedIds = new Set(project.crewAssignments.map((a) => a.crewMemberId));
  const availableCrew = crewMembers.filter((m) => !assignedIds.has(m.id));

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
                  <input name="fullName" defaultValue={client.fullName} required className="h-10 rounded-xl border border-border px-3 text-sm" />
                  <input name="email" type="email" defaultValue={client.email || ""} placeholder="Email" className="h-10 rounded-xl border border-border px-3 text-sm" />
                  <input name="phone" defaultValue={client.phone || ""} placeholder="Phone" className="h-10 rounded-xl border border-border px-3 text-sm" />
                  <div className="flex gap-2 sm:col-span-3">
                    <button type="submit" className="h-9 rounded-xl border border-border px-3 text-sm">Save</button>
                    <button type="submit" formAction={removeClientFromProjectAction} className="h-9 rounded-xl border border-red-200 px-3 text-sm text-red-600 hover:border-red-400">Remove</button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
          <details className="mt-4 rounded-xl border border-border/80">
            <summary className="cursor-pointer select-none px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">+ Add client</summary>
            <div className="p-3">
              <form action={addClientToProjectAction} className="grid gap-2 sm:grid-cols-3">
                <input type="hidden" name="projectId" value={project.id} />
                <input name="fullName" placeholder="Full name" required className="h-10 rounded-xl border border-border px-3 text-sm" />
                <input name="email" type="email" placeholder="Email" className="h-10 rounded-xl border border-border px-3 text-sm" />
                <input name="phone" placeholder="Phone" className="h-10 rounded-xl border border-border px-3 text-sm" />
                <button type="submit" className="h-10 rounded-xl border border-border px-3 text-sm sm:col-span-3 sm:justify-self-start">Add client</button>
              </form>
            </div>
          </details>
        </article>

        <article className="soft-panel p-5">
          <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Budget</h3>
          <div className="space-y-2 text-sm">
            <p className="flex items-center justify-between"><span>Total</span><span className="font-medium">{currency(project.budgetTotal)}</span></p>
            <p className="flex items-center justify-between"><span>Paid</span><span className="font-medium">{currency(project.amountPaid)}</span></p>
            <p className="flex items-center justify-between"><span>Remaining</span><span className="font-medium">{currency(project.amountRemaining)}</span></p>
            <p className="flex items-center justify-between"><span>Status</span><span className="font-medium capitalize">{project.status}</span></p>
          </div>
        </article>
      </section>

      <section className="soft-panel p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Edit Wedding Details</h3>
          {!hasSupabaseEnv ? <p className="text-xs text-muted-foreground">Read-only in demo mode.</p> : null}
        </div>
        <form id="edit-wedding-form" action={updateProjectAction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input name="title" required defaultValue={project.title} className="h-10 rounded-xl border border-border px-3 text-sm" />
          <input name="eventDate" type="text" required defaultValue={toDisplayDate(project.eventDate)} placeholder="DD-MM-YYYY" className="h-10 rounded-xl border border-border px-3 text-sm" />
          <input name="projectType" defaultValue={project.projectType} className="h-10 rounded-xl border border-border px-3 text-sm" />
          <select name="status" defaultValue={project.status} className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value="draft">Draft</option>
            <option value="negotiating">Negotiating</option>
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Unconfirmed</option>
            <option value="declined">Declined</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select name="editingStatus" defaultValue={project.editingStatus} className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="review">Review</option>
            <option value="completed">Completed</option>
          </select>
          <input name="budgetTotal" type="number" min="0" step="0.01" defaultValue={project.budgetTotal} className="h-10 rounded-xl border border-border px-3 text-sm" />
          <input name="amountPaid" type="number" min="0" step="0.01" defaultValue={project.amountPaid} className="h-10 rounded-xl border border-border px-3 text-sm" />
          <input name="notes" defaultValue={project.notes || ""} placeholder="Notes" className="h-10 rounded-xl border border-border px-3 text-sm sm:col-span-2" />
        </form>
      </section>

      <div className="flex">
        <button type="submit" form="edit-wedding-form" className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background">Save wedding</button>
      </div>

      <section className="soft-panel p-5">
        <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Crew</h3>
          <ul className="space-y-2">
            {project.crewAssignments.map((assignment) => (
              <li key={assignment.id} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
                <div>
                  <p className="font-medium">{assignment.crewMember.fullName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{assignment.assignmentRole} · {assignment.crewMember.roleType}</p>
                </div>
                <form action={removeCrewFromProjectAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="assignmentId" value={assignment.id} />
                  <button type="submit" className="h-8 rounded-lg border border-red-200 px-2 text-xs text-red-600 hover:border-red-400">Remove</button>
                </form>
              </li>
            ))}
          </ul>
          {availableCrew.length > 0 ? (
            <form action={addCrewToProjectAction} className="mt-4 grid gap-2 rounded-xl border border-border/80 p-3 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="projectId" value={project.id} />
              <select name="crewMemberId" required className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
                <option value="">Select crew member</option>
                {availableCrew.map((m) => (
                  <option key={m.id} value={m.id}>{m.fullName} ({m.roleType})</option>
                ))}
              </select>
              <input name="assignmentRole" placeholder="Role on this project" className="h-10 rounded-xl border border-border px-3 text-sm" />
              <button type="submit" className="h-10 rounded-xl border border-border px-4 text-sm">Add</button>
            </form>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {crewMembers.length === 0 ? "No crew in roster yet — add them in Contacts." : "All crew members are already assigned."}
            </p>
          )}
      </section>

      <section className="soft-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Tasks</h3>
            <Link href="/admin/tasks" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
          </div>
          <ul className="space-y-2">
            {project.tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${task.status === "done" ? "line-through opacity-40" : ""}`}>{task.title}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${priorityBadge[task.priority] || ""}`}>{task.priority}</span>
                    {task.dueDate ? <span className="text-xs text-muted-foreground">{task.dueDate}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <form action={updateTaskStatusAction} className="flex items-center gap-1">
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <select name="status" defaultValue={task.status} className="h-8 rounded-lg border border-border bg-white px-2 text-xs">
                      <option value="todo">To do</option>
                      <option value="in_progress">In progress</option>
                      <option value="done">Done</option>
                    </select>
                    <button type="submit" className="h-8 rounded-lg border border-border px-2 text-xs">✓</button>
                  </form>
                  <form action={deleteTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <button type="submit" className="h-8 w-8 rounded-lg border border-border text-sm text-muted-foreground hover:border-red-200 hover:text-red-600">×</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          <form action={createTaskAction} className="mt-4 grid gap-2 rounded-xl border border-border/80 p-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <input type="hidden" name="projectId" value={project.id} />
            <input name="title" placeholder="New task..." required className="h-10 rounded-xl border border-border px-3 text-sm" />
            <select name="priority" defaultValue="medium" className="h-10 rounded-xl border border-border bg-white px-2 text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <input name="dueDate" type="date" className="h-10 rounded-xl border border-border px-3 text-sm" />
            <button type="submit" className="h-10 rounded-xl border border-border px-4 text-sm">Add</button>
          </form>
      </section>
    </div>
  );
}
