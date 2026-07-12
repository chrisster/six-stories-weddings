"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, getCurrentUserRole } from "@/lib/auth";
import { getAssignedProjectIdsForEmail } from "@/lib/data";
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
  if (!projectId || !title) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("project_tasks").insert({
    project_id: projectId,
    title,
    status: "todo",
    assignee_id: assigneeId,
    due_date: dueDate,
  });
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

  const patch: Record<string, unknown> = {};

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
  revalidatePath("/admin/tasks");
}

export async function createEditingTaskAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  if ((await getCurrentUserRole()) === "crew") return;

  const projectId = String(formData.get("projectId") || "").trim();
  const kind = String(formData.get("kind") || "").trim();
  const assigneeId = String(formData.get("assigneeId") || "").trim() || null;
  const dueDate = String(formData.get("dueDate") || "").trim() || null;
  const status = String(formData.get("status") || "backlog").trim();

  if (!projectId || (kind !== "photo_edit" && kind !== "video_edit")) return;

  const admin = createAdminClient();
  if (!admin) return;

  const { data: project } = await admin
    .from("projects")
    .select("title, event_date")
    .eq("id", projectId)
    .maybeSingle();

  const title = String(project?.title || "Project");
  const eventDate = String(project?.event_date || "").replaceAll("-", ".");
  const label = kind === "video_edit" ? "VIDEO EDIT" : "PHOTO EDIT";
  const taskTitle = [label, eventDate, title].filter(Boolean).join(" - ");

  await admin.from("project_tasks").insert({
    project_id: projectId,
    title: taskTitle,
    status: VALID_STATUSES.includes(status) ? status : "backlog",
    kind,
    assignee_id: assigneeId,
    due_date: dueDate,
  });

  revalidatePath("/admin/tasks");
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
