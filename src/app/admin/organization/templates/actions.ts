"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminRole } from "@/lib/auth";
import { setActiveContractTemplate, updateContractTemplate } from "@/lib/contract-data";
import type { ContractClause, ContractTemplateSnapshot } from "@/lib/contracts";

function fail(message: string, templateId?: string): never {
  const suffix = templateId ? `&template=${encodeURIComponent(templateId)}` : "";
  redirect(
    `/admin/organization/templates?status=error&reason=${encodeURIComponent(message)}${suffix}`,
  );
}

export async function saveTemplateAction(formData: FormData) {
  await requireAdminRole();

  const templateId = String(formData.get("templateId") || "").trim();
  if (!templateId) fail("Missing template id.");

  // Clauses arrive as JSON from the editor: a variable-length list of
  // heading/body pairs does not map cleanly onto flat form fields.
  let clauses: ContractClause[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("clauses") || "[]"));
    if (!Array.isArray(parsed)) throw new Error("not an array");
    clauses = parsed.map((entry) => ({
      heading: String(entry?.heading ?? ""),
      body: String(entry?.body ?? ""),
    }));
  } catch {
    fail("Could not read the clause list. Please try again.", templateId);
  }

  const snapshot: ContractTemplateSnapshot = {
    name: String(formData.get("name") || ""),
    version: Number(formData.get("version") || 1),
    language: String(formData.get("language") || "el"),
    title: String(formData.get("title") || ""),
    intro: String(formData.get("intro") || ""),
    clauses,
    closing: String(formData.get("closing") || ""),
    consentText: String(formData.get("consentText") || ""),
  };

  const result = await updateContractTemplate(templateId, snapshot);
  if (!result.ok) fail(result.error ?? "Could not save.", templateId);

  revalidatePath("/admin/organization/templates");
  revalidatePath("/admin/contracts");
  redirect(`/admin/organization/templates?status=saved&template=${templateId}`);
}

export async function setActiveTemplateAction(formData: FormData) {
  await requireAdminRole();

  const templateId = String(formData.get("templateId") || "").trim();
  if (!templateId) fail("Missing template id.");

  const result = await setActiveContractTemplate(templateId);
  if (!result.ok) fail(result.error ?? "Could not update.", templateId);

  revalidatePath("/admin/organization/templates");
  revalidatePath("/admin/contracts");
  redirect(`/admin/organization/templates?status=active&template=${templateId}`);
}
