import { PostProductionBoard, type BoardTask } from "@/components/admin/post-production-board";
import { getCrewMembers, getProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [projects, crewMembers] = await Promise.all([getProjects(), getCrewMembers()]);

  const crewNameById = new Map(crewMembers.map((member) => [member.id, member.fullName]));

  const tasks: BoardTask[] = projects
    .filter((project) => project.status !== "completed" && project.status !== "cancelled")
    .flatMap((project) =>
      project.tasks
        .filter((task) => task.kind === "photo_edit" || task.kind === "video_edit")
        .map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          kind: (task.kind as "photo_edit" | "video_edit" | null) ?? null,
          dueDate: task.dueDate ?? null,
          assigneeId: task.assigneeId ?? null,
          assigneeName: task.assigneeId
            ? project.crewAssignments.find((a) => a.crewMemberId === task.assigneeId)?.crewMember
                .fullName ||
              crewNameById.get(task.assigneeId) ||
              null
            : null,
          projectId: project.id,
          projectTitle: project.title,
        })),
    );

  const openTasks = tasks.filter((task) => task.status !== "done").length;
  const assignees = crewMembers.map((member) => ({ id: member.id, name: member.fullName }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Post-production</p>
          <h1 className="title-cinematic mt-2 text-3xl font-semibold">Editing Tasks</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Photo &amp; video edits across active projects. Tasks are created automatically when an
            editor is assigned to a project.
          </p>
        </div>
        <span className="rounded-full border border-border bg-white px-4 py-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{openTasks}</span> open
        </span>
      </header>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-white p-10 text-center text-sm text-muted-foreground">
          No editing tasks yet. Assign an editor to a project to create photo or video edit tasks.
        </div>
      ) : (
        <PostProductionBoard tasks={tasks} assignees={assignees} />
      )}
    </div>
  );
}
