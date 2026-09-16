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
import { requireStudioAdmin } from "@/lib/auth";
import type { ContractWordingOverride } from "@/lib/contracts";
import { hasSupabaseEnv } from "@/lib/env";

async function requireAdmin() {
  if (!hasSupabaseEnv) redirect("/admin/contracts?status=error&reason=not_configured");
  const member = await requireStudioAdmin();
  return member?.email ?? null;
}

// ---------------------------------------------------------------------------
// Where to land afterwards
// ---------------------------------------------------------------------------

type ReturnTarget = { base: string; param: string };

/**
 * Send, resend and void run from two places: the contracts page and a
 * project's own Contracts section. The form says which with `returnTo`. Only a
 * project page path is accepted, so the field can never become an open
 * redirect; anything else lands on the contracts page as before.
 */
function resolveReturn(formData: FormData): ReturnTarget {
  const raw = String(formData.get("returnTo") || "").trim();
  if (/^\/admin\/projects\/[A-Za-z0-9-]+$/.test(raw)) {
    return { base: raw, param: "contract" };
  }
  return { base: "/admin/contracts", param: "status" };
}

function statusUrl(target: ReturnTarget, status: string, reason?: string | null): string {
  const params = new URLSearchParams({ [target.param]: status });
  if (reason) params.set("reason", reason);
  return `${target.base}?${params.toString()}`;
}

function revalidateAfterContractChange(target: ReturnTarget, projectId: string | null) {
  revalidatePath("/admin/contracts");
  revalidatePath("/admin");
  if (projectId) revalidatePath(`/admin/projects/${projectId}`);
  if (target.base !== "/admin/contracts") revalidatePath(target.base);
}

/**
 * Per-contract wording arrives as JSON from the composer, the same way the
 * template editor posts its clause list. Absent or empty means "as the
 * template says".
 */
function parseWording(formData: FormData): ContractWordingOverride | null {
  const raw = String(formData.get("wording") || "").trim();
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<ContractWordingOverride>;
  return {
    title: String(parsed.title ?? ""),
    intro: String(parsed.intro ?? ""),
    clauses: Array.isArray(parsed.clauses)
      ? parsed.clauses.map((clause) => ({
          heading: String(clause?.heading ?? ""),
          body: String(clause?.body ?? ""),
        }))
      : [],
    closing: String(parsed.closing ?? ""),
  };
}

export async function sendContractAction(formData: FormData) {
  const actorEmail = await requireAdmin();
  const target = resolveReturn(formData);
  const projectId = String(formData.get("projectId") || "").trim() || null;

  let wording: ContractWordingOverride | null = null;
  try {
    wording = parseWording(formData);
  } catch {
    redirect(statusUrl(target, "error", "Could not read the edited wording. Please try again."));
  }

  // Ticked project clients come one per field; anything typed by hand comes
  // as free text. Both are validated together in createAndSendContract.
  const ccEmails = [
    ...formData.getAll("ccEmails").map((value) => String(value)),
    ...String(formData.get("ccExtra") || "").split(/[,;\n]+/),
  ];

  const result = await createAndSendContract({
    projectId,
    recipientEmail: String(formData.get("recipientEmail") || ""),
    recipientName: String(formData.get("recipientName") || "") || null,
    templateId: String(formData.get("templateId") || "").trim() || null,
    ccEmails,
    wording,
    actorEmail,
  });

  if (!result.ok) {
    redirect(statusUrl(target, "error", result.error));
  }

  revalidateAfterContractChange(target, projectId);
  redirect(statusUrl(target, result.emailed ? "sent" : "sent_no_email"));
}

export async function resendContractAction(formData: FormData) {
  const actorEmail = await requireAdmin();
  const target = resolveReturn(formData);
  const id = String(formData.get("contractId") || "").trim();

  const result = await resendContract(id, actorEmail);
  if (!result.ok) {
    redirect(statusUrl(target, "error", result.error));
  }

  revalidateAfterContractChange(target, null);
  redirect(statusUrl(target, result.emailed ? "resent" : "sent_no_email"));
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
  const target = resolveReturn(formData);
  const id = String(formData.get("contractId") || "").trim();
  const reason = String(formData.get("reason") || "");

  const result = await voidContract(id, reason, actorEmail);
  if (!result.ok) {
    redirect(statusUrl(target, "error", result.error ?? ""));
  }

  revalidateAfterContractChange(target, null);
  redirect(statusUrl(target, "voided"));
}
