"use server";

import { headers } from "next/headers";

import { getContractForSigning, signContract } from "@/lib/contract-data";
import { normalizeLanguage, strings } from "@/lib/contract-i18n";

export type SignActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string>;
};

export async function submitSignatureAction(
  _prev: SignActionState,
  formData: FormData,
): Promise<SignActionState> {
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    null;

  const rawToken = String(formData.get("token") || "");
  const signatureKind = String(formData.get("signatureKind") || "typed");

  // Read the language before signing: signing nulls the token, after which the
  // contract can no longer be resolved from it.
  const before = await getContractForSigning(rawToken);
  const language = before.ok
    ? normalizeLanguage(before.contract.templateSnapshot.language)
    : "el";

  const result = await signContract({
    rawToken,
    firstName: String(formData.get("firstName") || ""),
    lastName: String(formData.get("lastName") || ""),
    city: String(formData.get("city") || ""),
    street: String(formData.get("street") || ""),
    isCompany: String(formData.get("isCompany") || "") === "on",
    companyName: String(formData.get("companyName") || ""),
    vatId: String(formData.get("vatId") || ""),
    taxOffice: String(formData.get("taxOffice") || ""),
    signatureKind: signatureKind === "drawn" ? "drawn" : "typed",
    signatureData: String(
      formData.get(signatureKind === "drawn" ? "signatureDrawn" : "signatureTyped") || "",
    ),
    consentAccepted: String(formData.get("consent") || "") === "on",
    ip,
    userAgent: headerList.get("user-agent"),
  });

  if (!result.ok) {
    return {
      status: "error",
      message: result.error,
      errors: result.errors,
    };
  }

  const t = strings(language);
  return {
    status: "success",
    message: result.emailed ? t.successMessageEmailed : t.successMessagePending,
  };
}
