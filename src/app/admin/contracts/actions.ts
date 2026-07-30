"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createAndSendContract,
  createContractFolder,
  deleteContractFolder,
  deleteContracts,
  moveContractsToFolder,
  renameContractFolder,
  resendContract,
  voidContract,
} from "@/lib/contract-data";
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
    templateId: String(formData.get("templateId") || "").trim() || null,
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

/** Preserves the folder the admin was viewing across a redirect. */
function folderQuery(formData: FormData): string {
  const folderId = String(formData.get("folderId") || "").trim();
  return folderId ? `&folder=${encodeURIComponent(folderId)}` : "";
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function createFolderAction(formData: FormData) {
  await requireAdmin();
  const result = await createContractFolder(String(formData.get("name") || ""));

  if (!result.ok) {
    redirect(`/admin/contracts?status=error&reason=${encodeURIComponent(result.error ?? "")}`);
  }

  revalidatePath("/admin/contracts");
  redirect("/admin/contracts?status=folder_created");
}

export async function renameFolderAction(formData: FormData) {
  await requireAdmin();
  const folderId = String(formData.get("folderId") || "").trim();
  const result = await renameContractFolder(folderId, String(formData.get("name") || ""));

  if (!result.ok) {
    redirect(`/admin/contracts?status=error&reason=${encodeURIComponent(result.error ?? "")}`);
  }

  revalidatePath("/admin/contracts");
  redirect(`/admin/contracts?status=folder_renamed${folderQuery(formData)}`);
}

/** Deletes the folder only — contracts inside it fall back to Unfiled. */
export async function deleteFolderAction(formData: FormData) {
  await requireAdmin();
  const result = await deleteContractFolder(String(formData.get("folderId") || "").trim());

  if (!result.ok) {
    redirect(`/admin/contracts?status=error&reason=${encodeURIComponent(result.error ?? "")}`);
  }

  revalidatePath("/admin/contracts");
  redirect("/admin/contracts?status=folder_deleted");
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export async function moveContractsAction(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("selected").map((value) => String(value));
  const target = String(formData.get("targetFolderId") || "").trim();

  const result = await moveContractsToFolder(ids, target || null);
  if (!result.ok) {
    redirect(
      `/admin/contracts?status=error&reason=${encodeURIComponent(result.error ?? "")}${folderQuery(formData)}`,
    );
  }

  revalidatePath("/admin/contracts");
  redirect(`/admin/contracts?status=moved&count=${result.moved}${folderQuery(formData)}`);
}

export async function deleteContractsAction(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("selected").map((value) => String(value));

  // The UI requires typing DELETE for a set containing signed contracts; this
  // is the server-side half of that guard.
  const confirmation = String(formData.get("confirm") || "").trim().toUpperCase();
  if (confirmation !== "DELETE") {
    redirect(
      `/admin/contracts?status=error&reason=${encodeURIComponent(
        'Type DELETE to confirm permanent deletion.',
      )}${folderQuery(formData)}`,
    );
  }

  const result = await deleteContracts(ids);
  if (!result.ok) {
    redirect(
      `/admin/contracts?status=error&reason=${encodeURIComponent(result.error ?? "")}${folderQuery(formData)}`,
    );
  }

  revalidatePath("/admin/contracts");
  redirect(
    `/admin/contracts?status=deleted&count=${result.deleted}&signed=${result.signedDeleted}${folderQuery(formData)}`,
  );
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
