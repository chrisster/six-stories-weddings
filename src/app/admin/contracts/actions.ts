"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAndSendContract, resendContract, voidContract } from "@/lib/contract-data";
import { getCurrentUser, getCurrentUserRole } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";

async function requireAdmin() {
  if (!hasSupabaseEnv) redirect("/admin/contracts?status=error&reason=not_configured");
  const role = await getCurrentUserRole();
  if (role !== "admin") redirect("/admin");
  const user = await getCurrentUser();
  return user?.email ?? null;
}

export async function sendContractAction(formData: FormData) {
  const actorEmail = await requireAdmin();

  const result = await createAndSendContract({
    projectId: String(formData.get("projectId") || "").trim() || null,
    recipientEmail: String(formData.get("recipientEmail") || ""),
    recipientName: String(formData.get("recipientName") || "") || null,
    actorEmail,
  });

  if (!result.ok) {
    redirect(`/admin/contracts?status=error&reason=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/admin/contracts");
  revalidatePath("/admin");
  redirect(`/admin/contracts?status=${result.emailed ? "sent" : "sent_no_email"}`);
}

export async function resendContractAction(formData: FormData) {
  const actorEmail = await requireAdmin();
  const id = String(formData.get("contractId") || "").trim();

  const result = await resendContract(id, actorEmail);
  if (!result.ok) {
    redirect(`/admin/contracts?status=error&reason=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/admin/contracts");
  redirect(`/admin/contracts?status=${result.emailed ? "resent" : "sent_no_email"}`);
}

export async function voidContractAction(formData: FormData) {
  const actorEmail = await requireAdmin();
  const id = String(formData.get("contractId") || "").trim();
  const reason = String(formData.get("reason") || "");

  const result = await voidContract(id, reason, actorEmail);
  if (!result.ok) {
    redirect(`/admin/contracts?status=error&reason=${encodeURIComponent(result.error ?? "")}`);
  }

  revalidatePath("/admin/contracts");
  redirect("/admin/contracts?status=voided");
}
