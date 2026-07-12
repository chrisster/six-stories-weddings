"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, getCurrentUserRole } from "@/lib/auth";
import { getAssignedProjectIdsForEmail, notifyCrewMemberById } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

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
    await notifyCrewMemberById(
      assigneeId,
      {
        type: "task_assigned",
        title: "A task was assigned to you",
        body: title,
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
    .select("title, assignee_id")
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
  const changedAssignee =
    "assignee_id" in patch && String(patch.assignee_id || "") !== String(currentAssignee || "");
  const finalAssignee =
    "assignee_id" in patch ? (patch.assignee_id as string | null) : currentAssignee;

  if (changedAssignee && finalAssignee) {
    await notifyCrewMemberById(
      finalAssignee,
      {
        type: "task_assigned",
        title: "A task was assigned to you",
        body: taskTitle,
        link: "/admin/tasks",
      },
      actor?.email,
    );
  } else if (finalAssignee) {
    const changes: string[] = [];
    if ("status" in patch) changes.push("status");
    if ("due_date" in patch) changes.push("due date");
    if ("title" in patch) changes.push("name");
    if (changes.length > 0) {
      await notifyCrewMemberById(
        finalAssignee,
        {
          type: "task_updated",
          title: "A task was updated",
          body: `${taskTitle} — ${changes.join(", ")} changed`,
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
    await notifyCrewMemberById(
      assigneeId,
      {
        type: "task_assigned",
        title: "A task was assigned to you",
        body: title,
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
