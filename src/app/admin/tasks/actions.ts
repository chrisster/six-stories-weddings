"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, getCurrentUserRole } from "@/lib/auth";
import { getAssignedProjectIdsForEmail, notifyCrewMemberById } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  stand_by: "Stand by",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

function statusLabel(status?: string | null): string {
  const key = String(status || "").trim();
  return STATUS_LABELS[key] || "To do";
}

function formatDueDate(value?: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function getProjectTitle(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  projectId: string,
): Promise<string> {
  if (!projectId) return "a project";
  const { data } = await admin
    .from("projects")
    .select("title")
    .eq("id", projectId)
    .maybeSingle();
  return String(data?.title || "a project");
}

function assignedTaskBody(
  taskTitle: string,
  projectTitle: string,
  status?: string | null,
  dueDate?: string | null,
): string {
  const due = formatDueDate(dueDate);
  const parts = [`"${taskTitle}" on ${projectTitle}.`, `Status: ${statusLabel(status)}.`];
  if (due) parts.push(`Due ${due}.`);
  return parts.join(" ");
}

async function crewCanTouchProject(projectId: string): Promise<boolean> {
  const user = await getCurrentUser();
  const assigned = await getAssignedProjectIdsForEmail(user?.email || "");
  return assigned.includes(projectId);
}

export async function createTaskAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const projectId = String(formData.get("projectId") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const assigneeId = String(formData.get("assigneeId") || "").trim() || null;
  const dueDate = String(formData.get("dueDate") || "").trim() || null;
  const statusRaw = String(formData.get("status") || "todo").trim();
  const status = VALID_STATUSES.includes(statusRaw) ? statusRaw : "todo";
  if (!projectId || !title) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("project_tasks").insert({
    project_id: projectId,
    title,
    status,
    assignee_id: assigneeId,
    due_date: dueDate,
  });
  if (assigneeId) {
    const actor = await getCurrentUser();
    const projectTitle = await getProjectTitle(admin, projectId);
    await notifyCrewMemberById(
      assigneeId,
      {
        type: "task_assigned",
        title: "New task assigned to you",
        body: assignedTaskBody(title, projectTitle, status, dueDate),
        link: "/admin/tasks",
      },
      actor?.email,
    );
  }
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/tasks");
}

export async function updateTaskStatusAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const taskId = String(formData.get("taskId") || "").trim();
  const projectId = String(formData.get("projectId") || "").trim();
  const status = String(formData.get("status") || "todo").trim();
  if (!taskId) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("project_tasks").update({ status }).eq("id", taskId);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/tasks");
}

const VALID_STATUSES = ["backlog", "stand_by", "todo", "in_progress", "review", "done"];

export async function updateTaskAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const taskId = String(formData.get("taskId") || "").trim();
  if (!taskId) return;

  const admin = createAdminClient();
  if (!admin) return;

  // Crew may only update tasks that belong to a project they are assigned to.
  if ((await getCurrentUserRole()) === "crew") {
    const { data: task } = await admin
      .from("project_tasks")
      .select("project_id")
      .eq("id", taskId)
      .maybeSingle();
    if (!task || !(await crewCanTouchProject(String(task.project_id)))) {
      return;
    }
  }

  const { data: current } = await admin
    .from("project_tasks")
    .select("title, assignee_id, project_id, status, due_date")
    .eq("id", taskId)
    .maybeSingle();
  const currentAssignee = current?.assignee_id ? String(current.assignee_id) : null;

  const patch: Record<string, unknown> = {};

  if (formData.has("title")) {
    const title = String(formData.get("title") || "").trim();
    if (title) patch.title = title;
  }
  if (formData.has("status")) {
    const status = String(formData.get("status") || "").trim();
    if (VALID_STATUSES.includes(status)) patch.status = status;
  }
  if (formData.has("dueDate")) {
    patch.due_date = String(formData.get("dueDate") || "").trim() || null;
  }
  if (formData.has("assigneeId")) {
    patch.assignee_id = String(formData.get("assigneeId") || "").trim() || null;
  }

  if (Object.keys(patch).length === 0) return;

  await admin.from("project_tasks").update(patch).eq("id", taskId);

  const actor = await getCurrentUser();
  const taskTitle = (patch.title as string | undefined) || String(current?.title || "A task");
  const projectTitle = await getProjectTitle(admin, String(current?.project_id || ""));
  const finalStatus = "status" in patch ? (patch.status as string) : current?.status;
  const finalDue = "due_date" in patch ? (patch.due_date as string | null) : current?.due_date;
  const changedAssignee =
    "assignee_id" in patch && String(patch.assignee_id || "") !== String(currentAssignee || "");
  const finalAssignee =
    "assignee_id" in patch ? (patch.assignee_id as string | null) : currentAssignee;

  if (changedAssignee && finalAssignee) {
    await notifyCrewMemberById(
      finalAssignee,
      {
        type: "task_assigned",
        title: "New task assigned to you",
        body: assignedTaskBody(taskTitle, projectTitle, finalStatus, finalDue),
        link: "/admin/tasks",
      },
      actor?.email,
    );
  } else if (finalAssignee) {
    const changes: string[] = [];
    let headline = "Your task was updated";
    if ("status" in patch) {
      changes.push(`moved to ${statusLabel(patch.status as string)}`);
      headline = `Task moved to ${statusLabel(patch.status as string)}`;
    }
    if ("due_date" in patch) {
      const due = formatDueDate(patch.due_date as string | null);
      changes.push(due ? `due date set to ${due}` : "due date removed");
      if (!("status" in patch)) headline = due ? "Task due date updated" : "Task due date removed";
    }
    if ("title" in patch) {
      changes.push(`renamed to "${taskTitle}"`);
      if (!("status" in patch) && !("due_date" in patch)) headline = "Task renamed";
    }
    if (changes.length > 0) {
      await notifyCrewMemberById(
        finalAssignee,
        {
          type: "task_updated",
          title: headline,
          body: `"${taskTitle}" on ${projectTitle}: ${changes.join("; ")}.`,
          link: "/admin/tasks",
        },
        actor?.email,
      );
    }
  }

  revalidatePath("/admin/tasks");
}

export async function createProjectTaskAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  if ((await getCurrentUserRole()) === "crew") return;

  const projectId = String(formData.get("projectId") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const assigneeId = String(formData.get("assigneeId") || "").trim() || null;
  const dueDate = String(formData.get("dueDate") || "").trim() || null;
  const statusRaw = String(formData.get("status") || "todo").trim();
  const status = VALID_STATUSES.includes(statusRaw) ? statusRaw : "todo";

  if (!projectId || !title) return;

  const admin = createAdminClient();
  if (!admin) return;

  await admin.from("project_tasks").insert({
    project_id: projectId,
    title,
    status,
    assignee_id: assigneeId,
    due_date: dueDate,
  });

  if (assigneeId) {
    const actor = await getCurrentUser();
    const projectTitle = await getProjectTitle(admin, projectId);
    await notifyCrewMemberById(
      assigneeId,
      {
        type: "task_assigned",
        title: "New task assigned to you",
        body: assignedTaskBody(title, projectTitle, status, dueDate),
        link: "/admin/tasks",
      },
      actor?.email,
    );
  }

  revalidatePath("/admin/tasks");
  revalidatePath(`/admin/projects/${projectId}`);
}

export async function deleteTaskAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  if ((await getCurrentUserRole()) === "crew") return;
  const taskId = String(formData.get("taskId") || "").trim();
  const projectId = String(formData.get("projectId") || "").trim();
  if (!taskId) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("project_tasks").delete().eq("id", taskId);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/tasks");
}
