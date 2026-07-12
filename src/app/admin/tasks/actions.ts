"use server";

import { revalidatePath } from "next/cache";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

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

export async function deleteTaskAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const taskId = String(formData.get("taskId") || "").trim();
  const projectId = String(formData.get("projectId") || "").trim();
  if (!taskId) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("project_tasks").delete().eq("id", taskId);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/tasks");
}
