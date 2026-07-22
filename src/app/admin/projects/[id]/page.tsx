import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addClientToProjectAction,
  addCrewToProjectAction,
  removeClientFromProjectAction,
  removeCrewFromProjectAction,
  setClientPortalPasswordAction,
  shareTimeplanAction,
  updateClientAction,
  updateCrewAssignmentAction,
  updateProjectAction,
} from "@/app/admin/projects/actions";
import { createTaskAction, deleteTaskAction, updateTaskStatusAction } from "@/app/admin/tasks/actions";
import { DeleteProjectButton } from "@/components/admin/delete-project-button";
import { ProjectAutosave } from "@/components/admin/project-autosave";
import { ProjectPaymentsFields } from "@/components/admin/project-payments-fields";
import { ProjectSaveButton } from "@/components/admin/project-save-button";
import { ProjectTimeplanFields } from "@/components/admin/project-timeplan-fields";
import { getClientPortalAccountsByEmails, getAssignedProjectIdsForEmail, getCrewMembers, getGalleries, getProjectById } from "@/lib/data";
import { getCurrentUser, getCurrentUserRole } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { formatDateDDMMYY } from "@/lib/utils";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    save?: string;
    reason?: string;
    detail?: string;
    share?: string;
    audience?: string;
    count?: string;
  }>;
};

type ServiceType = "photo" | "film";

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

function parseProjectType(projectType: string): {
  eventType: "wedding" | "baptism";
  eventLabel: string;
  services: ServiceType[];
} {
  if (projectType.includes("|")) {
    const [labelRaw, servicesRaw = ""] = projectType.split("|");
    const eventType = labelRaw.trim().toLowerCase() === "baptism" ? "baptism" : "wedding";
    const parsed = servicesRaw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is ServiceType => value === "photo" || value === "film");
    const services = Array.from(new Set(parsed));

    return {
      eventType,
      eventLabel: eventType === "baptism" ? "Baptism" : "Wedding",
      services,
    };
  }

  const lower = projectType.toLowerCase();
  const eventType = lower.includes("baptism") ? "baptism" : "wedding";
  const services: ServiceType[] = [];
  if (lower.includes("photography")) services.push("photo");
  if (lower.includes("film")) services.push("film");

  return {
    eventType,
    eventLabel: eventType === "baptism" ? "Baptism" : "Wedding",
    services,
  };
}

function serviceLabel(service: ServiceType) {
  return service === "photo" ? "Photography" : "Film";
}

const statusBadge: Record<string, string> = {
  todo: "bg-zinc-100 text-zinc-500",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
};

export default async function ProjectDetailPage({ params, searchParams }: ProjectPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const project = await getProjectById(id);

  if (!project) {
    notFound();
  }

  const [galleries, crewMembers] = await Promise.all([getGalleries(), getCrewMembers()]);
  const linkedGallery = galleries.find((gallery) => gallery.projectId === project.id);
  const role = await getCurrentUserRole();
  const isCrew = role === "crew";

  if (isCrew) {
    const user = await getCurrentUser();
    const assignedIds = new Set(await getAssignedProjectIdsForEmail(user?.email || ""));
    if (!assignedIds.has(project.id)) {
      notFound();
    }
  }

  const portalAccounts = await getClientPortalAccountsByEmails(
    project.clients.map((client) => client.email || "").filter(Boolean),
  );
  const projectTypeParts = parseProjectType(project.projectType);
  const amountPaidFromPayments = project.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const displayedAmountPaid = project.payments.length > 0 ? amountPaidFromPayments : project.amountPaid;
  const displayedRemaining = Math.max(0, project.offerAmount - displayedAmountPaid);

  const assignedIds = new Set(project.crewAssignments.map((a) => a.crewMemberId));
  const availableCrew = crewMembers.filter((m) => !assignedIds.has(m.id));

  return (
    <div className="space-y-6">
      {query.save === "ok" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Project saved.
        </div>
      ) : null}

      {query.save === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <p>
            {query.reason === "date"
              ? "Could not save project: invalid date format. Use DD-MM-YYYY."
              : "Could not save project. Please check fields and try again."}
          </p>
          {query.detail ? (
            <p className="mt-1 text-xs text-red-600/80">Details: {query.detail}</p>
          ) : null}
        </div>
      ) : null}

      {query.share === "ok" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Timeplan sent to {query.count || ""} {query.audience === "crew" ? "crew member(s)" : "client(s)"}.
        </div>
      ) : null}

      {query.share === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {query.reason === "empty"
            ? "Add at least one timeplan row before sharing."
            : query.reason === "no_recipients"
              ? "No email addresses found for the selected recipients."
              : query.reason === "send_failed"
                ? "Could not send the timeplan email. Check email settings."
                : "Could not share the timeplan."}
        </div>
      ) : null}

      <section className="soft-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Project</p>
            <h2 className="title-cinematic mt-2 text-3xl font-semibold">{project.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{formatDateDDMMYY(project.eventDate)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{projectTypeParts.eventLabel}</p>
            {projectTypeParts.services.length > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {projectTypeParts.services.map((service) => serviceLabel(service)).join(" • ")}
              </p>
            ) : null}
            {(project as any).referral ? (
              <p className="mt-1 text-sm text-muted-foreground">Referred by {(project as any).referral}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {linkedGallery ? (
              <Link
                href={`/admin/galleries/${linkedGallery.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30"
              >
                Open Gallery Manager
              </Link>
            ) : null}
            {!isCrew ? (
              <DeleteProjectButton projectId={project.id} projectTitle={project.title} />
            ) : null}
          </div>
        </div>

      </section>

      <section className="soft-panel overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-5 py-4">
          <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Clients</h3>
          {!isCrew ? (
          <details>
            <summary className="cursor-pointer list-none rounded-xl border border-foreground bg-foreground px-3 py-2 text-sm text-background">
              Add client
            </summary>
            <div className="mt-3 rounded-xl border border-border bg-white p-3">
              <form action={addClientToProjectAction} className="grid gap-2 sm:grid-cols-3">
                <input type="hidden" name="projectId" value={project.id} />
                <input name="fullName" placeholder="Full name" required className="h-10 rounded-xl border border-border px-3 text-sm" />
                <input name="email" type="email" placeholder="Email" className="h-10 rounded-xl border border-border px-3 text-sm" />
                <input name="phone" placeholder="Phone" className="h-10 rounded-xl border border-border px-3 text-sm" />
                <button type="submit" className="h-10 rounded-xl border border-foreground bg-foreground px-3 text-sm text-background sm:col-span-3 sm:justify-self-start">
                  Add client
                </button>
              </form>
            </div>
          </details>
          ) : null}
        </div>

        {project.clients.length > 0 ? (
          <>
            <div className="hidden border-b border-border/80 bg-zinc-50 px-5 py-3 text-xs tracking-[0.12em] text-muted-foreground uppercase sm:grid sm:grid-cols-[1.2fr_0.8fr_1.4fr_1fr_auto]">
              <p>Name</p>
              <p>Type</p>
              <p>Email</p>
              <p>Notes</p>
              <p className="text-right">Action</p>
            </div>
            <ul>
              {project.clients.map((client) => (
                <li key={client.id} className="border-b border-border/70 px-5 py-4 last:border-0">
                  <div className="grid items-start gap-3 sm:grid-cols-[1.2fr_0.8fr_1.4fr_1fr_auto]">
                    <p className="text-sm font-medium text-foreground">{client.fullName}</p>
                    <span className="inline-flex h-6 w-fit items-center rounded-md bg-sky-100 px-2 text-xs text-sky-800">
                      Client
                    </span>
                    <p className="text-sm text-muted-foreground">{client.email || "-"}</p>
                    <p className="text-sm text-muted-foreground">{client.notes || "-"}</p>
                    {!isCrew ? (
                    <details className="justify-self-start sm:justify-self-end">
                      <summary className="cursor-pointer list-none rounded-xl border border-border bg-white px-3 py-1.5 text-sm text-foreground">
                        Edit
                      </summary>
                      <div className="mt-3 rounded-xl border border-border/80 bg-zinc-50 p-3">
                        <form action={updateClientAction} className="grid gap-2 sm:grid-cols-3">
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="clientId" value={client.id} />
                          <input name="fullName" defaultValue={client.fullName} required className="h-10 rounded-xl border border-border px-3 text-sm" />
                          <input name="email" type="email" defaultValue={client.email || ""} className="h-10 rounded-xl border border-border px-3 text-sm" />
                          <input name="phone" defaultValue={client.phone || ""} className="h-10 rounded-xl border border-border px-3 text-sm" />
                          <div className="flex gap-2 sm:col-span-3">
                            <button type="submit" className="h-9 rounded-xl border border-border px-3 text-sm">Save</button>
                            <button type="submit" formAction={removeClientFromProjectAction} className="h-9 rounded-xl border border-red-200 px-3 text-sm text-red-600 hover:border-red-400">Remove</button>
                          </div>
                        </form>

                        {client.email ? (
                          <div className="mt-4 border-t border-border/70 pt-4">
                            {(() => {
                              const portal = portalAccounts[client.email.toLowerCase()];
                              return (
                                <>
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Portal access</p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {portal
                                      ? portal.hasPassword
                                        ? "Portal ready"
                                        : "Account exists but no password is set yet"
                                      : "No portal account yet"}
                                  </p>
                                  <form action={setClientPortalPasswordAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                                    <input type="hidden" name="projectId" value={project.id} />
                                    <input type="hidden" name="fullName" value={client.fullName} />
                                    <input type="hidden" name="email" value={client.email || ""} />
                                    <input
                                      name="portalPassword"
                                      type="password"
                                      minLength={8}
                                      required
                                      placeholder="Set or reset portal password"
                                      className="h-10 rounded-xl border border-border px-3 text-sm"
                                    />
                                    <button type="submit" className="h-10 rounded-xl border border-border px-4 text-sm hover:border-foreground/30">
                                      Save password
                                    </button>
                                  </form>
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <p className="mt-4 border-t border-border/70 pt-4 text-sm text-muted-foreground">
                            Add an email address to enable client portal access.
                          </p>
                        )}
                      </div>
                    </details>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="px-5 py-6 text-sm text-muted-foreground">No clients yet.</p>
        )}
      </section>

      <section className="soft-panel p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Details</h3>
          {isCrew ? (
            <p className="text-xs text-muted-foreground">View only</p>
          ) : !hasSupabaseEnv ? (
            <p className="text-xs text-muted-foreground">Read-only in demo mode.</p>
          ) : null}
        </div>
        <form id="edit-wedding-form" action={updateProjectAction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <fieldset disabled={isCrew} className="contents">
          <input type="hidden" name="projectId" value={project.id} />

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Project title</label>
            <input name="title" required defaultValue={project.title} className="h-10 w-full rounded-xl border border-border px-3 text-sm" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Event date</label>
            <input name="eventDate" type="text" required defaultValue={toDisplayDate(project.eventDate)} placeholder="DD-MM-YYYY" className="h-10 w-full rounded-xl border border-border px-3 text-sm" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Event type</label>
            <select name="eventType" defaultValue={projectTypeParts.eventType} className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm">
              <option value="wedding">Wedding</option>
              <option value="baptism">Baptism</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Project status</label>
            <select name="status" defaultValue={project.status} className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm">
              <option value="draft">Draft</option>
              <option value="negotiating">Negotiating</option>
              <option value="scheduled">Scheduled</option>
              <option value="post_production">Post production</option>
              <option value="completed">Completed</option>
              <option value="declined">Declined</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Services</label>
            <div className="flex h-10 items-center gap-4 rounded-xl border border-border bg-white px-3 text-sm">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="services"
                  value="photo"
                  defaultChecked={projectTypeParts.services.includes("photo")}
                  className="size-4 rounded border-border"
                />
                Photography
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="services"
                  value="film"
                  defaultChecked={projectTypeParts.services.includes("film")}
                  className="size-4 rounded border-border"
                />
                Film
              </label>
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Referral</label>
            <input name="referral" defaultValue={project.referral || ""} className="h-10 w-full rounded-xl border border-border px-3 text-sm" />
          </div>

          <div className="space-y-1.5 sm:col-span-2 xl:col-span-4">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Notes</label>
            <textarea name="notes" defaultValue={project.notes || ""} rows={3} className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
          </div>
          </fieldset>
        </form>
      </section>

      {!isCrew ? (
        <section className="soft-panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Financials</h3>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-border/80 bg-zinc-50 px-3 py-1 text-xs text-muted-foreground">
                Paid {currency(displayedAmountPaid)}
              </span>
              <span className="rounded-full border border-border/80 bg-zinc-50 px-3 py-1 text-xs text-muted-foreground">
                Remaining {currency(displayedRemaining)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Offer</label>
              <input
                form="edit-wedding-form"
                name="offerAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={project.offerAmount}
                className="h-10 w-full rounded-xl border border-border px-3 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Payments</p>
              <ProjectPaymentsFields formId="edit-wedding-form" initialPayments={project.payments} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="soft-panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Timeplan</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Schedule for the wedding day. Add times, actions, locations, and notes, then share with clients or crew.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={shareTimeplanAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="audience" value="client" />
              <button
                type="submit"
                className="h-9 rounded-full border border-border px-4 text-sm hover:border-foreground/30"
              >
                Share with clients
              </button>
            </form>
            <form action={shareTimeplanAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="audience" value="crew" />
              <button
                type="submit"
                className="h-9 rounded-full border border-border px-4 text-sm hover:border-foreground/30"
              >
                Share with crew
              </button>
            </form>
          </div>
        </div>

        <fieldset disabled={isCrew} className="m-0 border-0 p-0">
          <ProjectTimeplanFields formId="edit-wedding-form" initialTimeplan={project.timeplan} />
        </fieldset>

        <p className="mt-3 text-xs text-muted-foreground">
          Timeplan changes are saved with the project (autosave or Save). Share buttons email the currently saved timeplan.
        </p>
      </section>

      <section className="soft-panel p-5">
        <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Crew</h3>
          <ul className="space-y-3">
            {project.crewAssignments.map((assignment) => (
              <li key={assignment.id} className="rounded-xl border border-border/70 bg-zinc-50 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{assignment.crewMember.fullName}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                    {assignment.assignmentRole} ·{" "}
                    {assignment.participantType === "freelancer" ? (
                      <span className="text-amber-600">
                        Freelancer{!isCrew && assignment.freelancerFee != null ? ` · ${currency(assignment.freelancerFee)}` : ""}
                      </span>
                    ) : (
                      "In-house"
                    )}
                    </p>
                  </div>
                  {!isCrew && (assignment as any).participantType === "freelancer" ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Freelancer{(assignment as any).freelancerBudget ? ` €${(assignment as any).freelancerBudget}` : ""}</span>
                  ) : null}
                  {!isCrew ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <details className="group relative">
                        <summary className="cursor-pointer list-none rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-foreground hover:border-foreground/40">
                          Edit
                        </summary>
                        <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-border bg-white p-3 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.4)]">
                          <form action={updateCrewAssignmentAction} className="grid gap-2">
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="assignmentId" value={assignment.id} />
                            <select name="assignmentRole" defaultValue={assignment.assignmentRole || ""} className="h-9 rounded-lg border border-border bg-white px-2 text-sm">
                              <option value="Photographer">Photographer</option>
                              <option value="Second Photographer">Second Photographer</option>
                              <option value="Videographer">Videographer</option>
                              <option value="Second Videographer">Second Videographer</option>
                              <option value="Editor">Editor</option>
                              <option value="Video Editor">Video Editor</option>
                              <option value="Assistant">Assistant</option>
                              <option value="Drone Operator">Drone Operator</option>
                              <option value="Coordinator">Coordinator</option>
                              <option value="Partner">Partner</option>
                            </select>
                            <select name="participantType" defaultValue={assignment.participantType} className="h-9 rounded-lg border border-border bg-white px-2 text-sm">
                              <option value="inhouse">In-house</option>
                              <option value="freelancer">Freelancer</option>
                            </select>
                            <input
                              name="freelancerFee"
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={assignment.freelancerFee ?? ""}
                              placeholder="Fee (freelancer)"
                              className="h-9 rounded-lg border border-border px-2 text-sm"
                            />
                            <button type="submit" className="h-9 rounded-lg border border-foreground bg-foreground px-3 text-sm text-background">
                              Save
                            </button>
                          </form>
                        </div>
                      </details>
                      <form action={removeCrewFromProjectAction}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="assignmentId" value={assignment.id} />
                        <button type="submit" className="h-8 rounded-lg border border-red-200 px-2 text-xs text-red-600 hover:border-red-400">Remove</button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {!isCrew && availableCrew.length > 0 ? (
            <form action={addCrewToProjectAction} className="mt-4 grid gap-3 rounded-xl border border-border/80 bg-zinc-50 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_180px_180px_auto]">
              <input type="hidden" name="projectId" value={project.id} />
              <select name="crewMemberId" required className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
                <option value="">Select crew member</option>
                {availableCrew.map((m) => (
                  <option key={m.id} value={m.id}>{m.fullName} ({m.roleType})</option>
                ))}
              </select>
              <select name="assignmentRole" defaultValue="" required className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
                <option value="" disabled>Role on this project</option>
                <option value="Photographer">Photographer</option>
                <option value="Second Photographer">Second Photographer</option>
                <option value="Videographer">Videographer</option>
                <option value="Second Videographer">Second Videographer</option>
                <option value="Editor">Editor</option>
                <option value="Video Editor">Video Editor</option>
                <option value="Assistant">Assistant</option>
                <option value="Drone Operator">Drone Operator</option>
                <option value="Coordinator">Coordinator</option>
                <option value="Partner">Partner</option>
              </select>
              <select name="participantType" defaultValue="inhouse" className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
                <option value="inhouse">In-house</option>
                <option value="freelancer">Freelancer</option>
              </select>
              <input name="freelancerFee" type="number" min="0" step="0.01" placeholder="Fee (freelancer)" className="h-10 rounded-xl border border-border px-3 text-sm" />
              <button type="submit" className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background">Add crew</button>
            </form>
          ) : !isCrew ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {crewMembers.length === 0 ? "No crew in roster yet — add them in Team." : "All crew members are already assigned."}
            </p>
          ) : null}
      </section>

      <section className="soft-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Tasks</h3>
            <Link href="/admin/tasks" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
          </div>
          <ul className="space-y-3">
            {project.tasks.map((task) => {
              const assignee = task.assigneeId
                ? project.crewAssignments.find((a) => a.crewMemberId === task.assigneeId)?.crewMember.fullName
                : null;
              return (
              <li key={task.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-zinc-50 px-3 py-3">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${task.status === "done" ? "line-through opacity-40" : ""}`}>{task.title}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {assignee ? <span className="text-xs text-muted-foreground">{assignee}</span> : null}
                    {task.dueDate ? <span className="text-xs text-muted-foreground">{formatDateDDMMYY(task.dueDate)}</span> : null}
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
              );
            })}
          </ul>
          <form action={createTaskAction} className="mt-4 grid gap-2 rounded-xl border border-border/80 bg-zinc-50 p-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <input type="hidden" name="projectId" value={project.id} />
            <input name="title" placeholder="New task..." required className="h-10 rounded-xl border border-border px-3 text-sm" />
            <select name="assigneeId" className="h-10 rounded-xl border border-border bg-white px-2 text-sm">
              <option value="">Assignee</option>
              {project.crewAssignments.map((a) => (
                <option key={a.crewMemberId} value={a.crewMemberId}>{a.crewMember.fullName}</option>
              ))}
            </select>
            <input name="dueDate" type="date" className="h-10 rounded-xl border border-border px-3 text-sm" />
            <button type="submit" className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background">Add task</button>
          </form>
      </section>

      <div className="flex items-center justify-end gap-3">
        {!isCrew ? (
          <>
            <ProjectAutosave formId="edit-wedding-form" />
            <ProjectSaveButton formId="edit-wedding-form" />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">You have view-only access to this project.</p>
        )}
      </div>
    </div>
  );
}
