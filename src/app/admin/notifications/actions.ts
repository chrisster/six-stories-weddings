"use server";

import { revalidatePath } from "next/cache";

import { requireStudioUser } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/data";

// The bell lives in the admin layout, so the layout (and whichever admin page
// is open) is what needs re-rendering, not just /admin.
export async function markAllNotificationsReadAction() {
  const member = await requireStudioUser();
  if (!member) return;
  await markNotificationsRead(member.email);
  revalidatePath("/admin", "layout");
}

export async function markNotificationReadAction(formData: FormData) {
  const member = await requireStudioUser();
  if (!member) return;
  const id = String(formData.get("id") || "").trim();
  if (!id) return;
  await markNotificationsRead(member.email, [id]);
  revalidatePath("/admin", "layout");
}
