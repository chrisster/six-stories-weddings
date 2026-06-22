import Link from "next/link";

import { createTaskAction, deleteTaskAction, updateTaskStatusAction } from "@/app/admin/tasks/actions";
import { getProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

const priorityBadge: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-500",
  medium: "bg-sky-100 text-sky-700",
  high: "bg-red-100 text-red-700",
};

const statusBadge: Record<string, string> = {
  todo: "bg-zinc-100 text-zinc-500",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
};

export default async function TasksPage() {
  const projects = await getProjects();
  const allTasks = projects
    .flatMap((p) => p.tasks.map((t) => ({ ...t, projectTitle: p.title, projectId: p.id })))
    .sort((a, b) => {
      const order = { todo: 0, in_progress: 1, done: 2 };
      return (order[a.status] ?? 0) - (order[b.status] ?? 0);
    });

  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t) => t.status === "done").length;
  const openTasks = totalTasks - doneTasks;

  return (
    <div className="space-y-5">
      <section className="soft-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">Overview</p>
            <h2 className="title-cinematic mt-1 text-3xl font-semibold">Tasks</h2>
          </div>
          <div className="flex gap-4 text-sm">
            <span><span className="font-semibold">{openTasks}</span> open</span>
            <span><span className="font-semibold">{doneTasks}</span> done</span>
          </div>
        </div>
      </section>

      {projects.map((project) => {
        const tasks = project.tasks.sort((a, b) => {
          const order = { todo: 0, in_progress: 1, done: 2 };
          return (order[a.status] ?? 0) - (order[b.status] ?? 0);
        });

        return (
          <section key={project.id} className="soft-panel overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
              <Link href={`/admin/projects/${project.id}`} className="font-medium hover:underline">
                {project.title}
              </Link>
              <span className="text-xs text-muted-foreground">{project.eventDate}</span>
            </div>

            {tasks.length > 0 ? (
              <ul className="divide-y divide-border/50">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${task.status === "done" ? "line-through opacity-40" : ""}`}>
                        {task.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${priorityBadge[task.priority] || ""}`}>
                          {task.priority}
                        </span>
                        {task.dueDate ? <span className="text-xs text-muted-foreground">{task.dueDate}</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <form action={updateTaskStatusAction} className="flex items-center gap-1">
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <select
                          name="status"
                          defaultValue={task.status}
                          className="h-8 rounded-lg border border-border bg-white px-2 text-xs"
                        >
                          <option value="todo">To do</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                        </select>
                        <button type="submit" className="h-8 rounded-lg border border-border px-2 text-xs">✓</button>
                      </form>
                      <form action={deleteTaskAction}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <button
                          type="submit"
                          className="h-8 w-8 rounded-lg border border-border text-sm text-muted-foreground hover:border-red-200 hover:text-red-600"
                        >
                          ×
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-3 text-sm text-muted-foreground">No tasks yet.</p>
            )}

            <div className="border-t border-border/60 px-5 py-3">
              <form action={createTaskAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="projectId" value={project.id} />
                <input
                  name="title"
                  placeholder="Add task..."
                  required
                  className="h-9 flex-1 rounded-xl border border-border px-3 text-sm"
                />
                <select name="priority" defaultValue="medium" className="h-9 rounded-xl border border-border bg-white px-2 text-sm">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <input name="dueDate" type="date" className="h-9 rounded-xl border border-border px-3 text-sm" />
                <button type="submit" className="h-9 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background">
                  Add
                </button>
              </form>
            </div>
          </section>
        );
      })}

      {projects.length === 0 && (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      )}
    </div>
  );
}
