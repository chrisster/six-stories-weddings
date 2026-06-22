"use server";

import { revalidatePath } from "next/cache";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createTaskAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const projectId = String(formData.get("projectId") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const priority = String(formData.get("priority") || "medium").trim();
  const dueDate = String(formData.get("dueDate") || "").trim() || null;
  if (!projectId || !title) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("project_tasks").insert({
    project_id: projectId,
    title,
    status: "todo",
    priority,
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
