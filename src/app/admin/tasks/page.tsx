import { PostProductionBoard, type BoardTask } from "@/components/admin/post-production-board";
import { getCurrentUser, getCurrentUserRole } from "@/lib/auth";
import {
  getAssignedProjectIdsForEmail,
  getCrewMemberIdsForEmail,
  getCrewMembers,
  getProjects,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [projects, crewMembers] = await Promise.all([getProjects(), getCrewMembers()]);
  const role = await getCurrentUserRole();
  const isCrew = role === "crew";

  let visibleProjects = projects.filter(
    (project) => project.status !== "completed" && project.status !== "cancelled",
  );

  let crewMemberIds: Set<string> | null = null;
  if (isCrew) {
    const user = await getCurrentUser();
    const [assignedIds, memberIds] = await Promise.all([
      getAssignedProjectIdsForEmail(user?.email || ""),
      getCrewMemberIdsForEmail(user?.email || ""),
    ]);
    const assignedSet = new Set(assignedIds);
    crewMemberIds = new Set(memberIds);
    visibleProjects = visibleProjects.filter((project) => assignedSet.has(project.id));
  }

  const crewNameById = new Map(crewMembers.map((member) => [member.id, member.fullName]));

  let tasks: BoardTask[] = visibleProjects.flatMap((project) =>
    project.tasks.map((task) => ({
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

  // Crew members only see the tasks assigned specifically to them.
  if (isCrew && crewMemberIds) {
    tasks = tasks.filter((task) => task.assigneeId && crewMemberIds!.has(task.assigneeId));
  }

  const openTasks = tasks.filter((task) => task.status !== "done").length;
  const assignees = crewMembers.map((member) => ({ id: member.id, name: member.fullName }));
  const projectOptions = visibleProjects.map((project) => ({ id: project.id, title: project.title }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Workspace</p>
          <h1 className="title-cinematic mt-2 text-3xl font-semibold">Tasks</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            All tasks across active projects. Create tasks on a project or here, and track them by
            status.
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
