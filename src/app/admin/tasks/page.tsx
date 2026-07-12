import { PostProductionBoard, type BoardTask } from "@/components/admin/post-production-board";
import { getCurrentUser, getCurrentUserRole } from "@/lib/auth";
import { getAssignedProjectIdsForEmail, getCrewMembers, getProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [projects, crewMembers] = await Promise.all([getProjects(), getCrewMembers()]);
  const role = await getCurrentUserRole();
  const isCrew = role === "crew";

  let visibleProjects = projects.filter(
    (project) => project.status !== "completed" && project.status !== "cancelled",
  );

  if (isCrew) {
    const user = await getCurrentUser();
    const assignedIds = new Set(await getAssignedProjectIdsForEmail(user?.email || ""));
    visibleProjects = visibleProjects.filter((project) => assignedIds.has(project.id));
  }

  const crewNameById = new Map(crewMembers.map((member) => [member.id, member.fullName]));

  const tasks: BoardTask[] = visibleProjects.flatMap((project) =>
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
  const projectOptions = visibleProjects.map((project) => ({ id: project.id, title: project.title }));

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

      <PostProductionBoard
        tasks={tasks}
        assignees={assignees}
        projects={projectOptions}
        canManage={!isCrew}
      />
    </div>
  );
}
