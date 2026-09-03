"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/data";

// The bell lives in the admin layout, so the layout (and whichever admin page
// is open) is what needs re-rendering, not just /admin.
export async function markAllNotificationsReadAction() {
  const user = await getCurrentUser();
  if (!user?.email) return;
  await markNotificationsRead(user.email);
  revalidatePath("/admin", "layout");
}

export async function markNotificationReadAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user?.email) return;
  const id = String(formData.get("id") || "").trim();
  if (!id) return;
  await markNotificationsRead(user.email, [id]);
  revalidatePath("/admin", "layout");
}
