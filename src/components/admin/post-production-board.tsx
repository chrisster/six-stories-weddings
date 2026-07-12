"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createProjectTaskAction, deleteTaskAction, updateTaskAction } from "@/app/admin/tasks/actions";

export type BoardTask = {
  id: string;
  title: string;
  status: string;
  kind: "photo_edit" | "video_edit" | null;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string;
  projectTitle: string;
};

type Assignee = { id: string; name: string };
type ProjectOption = { id: string; title: string };

type PostProductionBoardProps = {
  tasks: BoardTask[];
  assignees: Assignee[];
  projects: ProjectOption[];
  canManage: boolean;
};

const STATUS_ORDER = ["backlog", "stand_by", "in_progress", "todo", "review", "done"] as const;

const STATUS_META: Record<string, { label: string; pill: string; dot: string }> = {
  backlog: { label: "Backlog", pill: "bg-red-100 text-red-700", dot: "bg-red-500" },
  stand_by: { label: "Stand by", pill: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
  in_progress: { label: "In progress", pill: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  todo: { label: "To do", pill: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  review: { label: "Review", pill: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  done: { label: "Done", pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};

function initials(name: string | null) {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDue(due: string | null) {
  if (!due) return "";
  const parts = due.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
  }
  return due;
}

function isOverdue(due: string | null) {
  if (!due) return false;
  const date = new Date(`${due}T23:59:59`);
  return date.getTime() < Date.now();
}

export function PostProductionBoard({ tasks, assignees, projects, canManage }: PostProductionBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showAdd, setShowAdd] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, BoardTask[]>();
    STATUS_ORDER.forEach((status) => map.set(status, []));
    tasks.forEach((task) => {
      const key = STATUS_ORDER.includes(task.status as (typeof STATUS_ORDER)[number])
        ? task.status
        : "todo";
      map.set(key, [...(map.get(key) || []), task]);
    });
    return map;
  }, [tasks]);

  const submit = (taskId: string, field: string, value: string) => {
    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set(field, value);
    startTransition(async () => {
      await updateTaskAction(formData);
      router.refresh();
    });
  };

  const remove = (taskId: string) => {
    if (!confirm("Delete this task?")) return;
    const formData = new FormData();
    formData.set("taskId", taskId);
    startTransition(async () => {
      await deleteTaskAction(formData);
      router.refresh();
    });
  };

  const createTask = (formData: FormData) => {
    startTransition(async () => {
      await createProjectTaskAction(formData);
      setShowAdd(false);
      router.refresh();
    });
  };

  return (
    <div className={`space-y-6 ${isPending ? "opacity-70" : ""}`}>
      {canManage ? (
        <div className="rounded-2xl border border-border/70 bg-white p-3">
          {!showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
            >
              + Add editing task
            </button>
          ) : (
            <form action={createTask} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              <input
                name="title"
                required
                placeholder="Task name"
                className="h-10 rounded-xl border border-border px-3 text-sm xl:col-span-2"
              />
              <select name="projectId" required className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
              <select name="assigneeId" className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
                <option value="">Assignee</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <input name="dueDate" type="date" className="h-10 rounded-xl border border-border px-3 text-sm" />
              <div className="flex gap-2">
                <button type="submit" className="h-10 flex-1 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background">
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="h-10 rounded-xl border border-border px-4 text-sm hover:border-foreground/40"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {STATUS_ORDER.map((status) => {
        const items = grouped.get(status) || [];
        if (items.length === 0) return null;
        const meta = STATUS_META[status];
        const isCollapsed = collapsed[status];

        return (
          <section key={status}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [status]: !c[status] }))}
              className="mb-2 flex items-center gap-2"
            >
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${meta.pill}`}>
                <span className={`size-2 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </button>

            {!isCollapsed ? (
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-white">
                <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px_150px_40px] gap-3 border-b border-border/60 px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground sm:grid">
                  <span>Name</span>
                  <span>Due date</span>
                  <span>Assignee</span>
                  <span>Status</span>
                  <span />
                </div>

                <ul className="divide-y divide-border/50">
                  {items.map((task) => (
                    <li
                      key={task.id}
                      className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_120px_150px_40px] sm:items-center sm:gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`size-2.5 shrink-0 rounded-full ${
                              task.kind === "video_edit"
                                ? "bg-rose-500"
                                : task.kind === "photo_edit"
                                  ? "bg-blue-500"
                                  : STATUS_META[task.status]?.dot || "bg-zinc-400"
                            }`}
                          />
                          <input
                            defaultValue={task.title}
                            onBlur={(e) => {
                              if (e.target.value.trim() && e.target.value !== task.title) {
                                submit(task.id, "title", e.target.value.trim());
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                            className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 text-sm font-medium text-foreground hover:border-border focus:border-border focus:bg-white focus:outline-none"
                          />
                        </div>
                        <Link
                          href={`/admin/projects/${task.projectId}`}
                          className="ml-4 text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {task.projectTitle}
                        </Link>
                      </div>

                      <div>
                        <input
                          type="date"
                          defaultValue={task.dueDate || ""}
                          onChange={(e) => submit(task.id, "dueDate", e.target.value)}
                          className={`h-8 w-full rounded-lg border border-border bg-white px-2 text-xs ${
                            isOverdue(task.dueDate) ? "text-red-600" : ""
                          }`}
                        />
                        <span className="sr-only">{formatDue(task.dueDate)}</span>
                      </div>

                      <div>
                        <select
                          defaultValue={task.assigneeId || ""}
                          onChange={(e) => submit(task.id, "assigneeId", e.target.value)}
                          className="h-8 w-full rounded-lg border border-border bg-white px-2 text-xs"
                          title={task.assigneeName || "Unassigned"}
                        >
                          <option value="">{initials(task.assigneeName) || "Unassigned"}</option>
                          {assignees.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <select
                          defaultValue={task.status}
                          onChange={(e) => submit(task.id, "status", e.target.value)}
                          className={`h-8 w-full rounded-lg border-0 px-2 text-xs font-semibold ${STATUS_META[task.status]?.pill || "bg-zinc-100 text-zinc-600"}`}
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_META[s].label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => remove(task.id)}
                          className="h-8 w-8 justify-self-end rounded-lg border border-border text-sm text-muted-foreground transition hover:border-red-200 hover:text-red-600"
                          aria-label="Delete task"
                        >
                          ×
                        </button>
                      ) : (
                        <span />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-white p-10 text-center text-sm text-muted-foreground">
          No editing tasks yet. Assign an editor to a project — or add one manually above.
        </div>
      ) : null}
    </div>
  );
}
