"use server";

import { headers } from "next/headers";

import { signContract } from "@/lib/contract-data";

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

  const signatureKind = String(formData.get("signatureKind") || "typed");

  const result = await signContract({
    rawToken: String(formData.get("token") || ""),
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

  return {
    status: "success",
    message: result.emailed
      ? "Το συμφωνητικό υπογράφηκε. Αντίγραφο σε PDF στάλθηκε στο email σας."
      : "Το συμφωνητικό υπογράφηκε. Θα λάβετε σύντομα αντίγραφο σε PDF.",
  };
}
