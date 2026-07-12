"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/data";

export async function markAllNotificationsReadAction() {
  const user = await getCurrentUser();
  if (!user?.email) return;
  await markNotificationsRead(user.email);
  revalidatePath("/admin");
}

export async function markNotificationReadAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user?.email) return;
  const id = String(formData.get("id") || "").trim();
  if (!id) return;
  await markNotificationsRead(user.email, [id]);
  revalidatePath("/admin");
}
