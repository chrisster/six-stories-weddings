/**
 * Smoke test for the contract PDF: renders a template with sample signer data
 * so glyph coverage, wording and layout can be eyeballed.
 *
 *   npx tsx scripts/test-contract-pdf.tsx out.pdf [el|en]
 *
 * Set SIG_DATA_URI to a data: URI to preview the studio countersignature.
 */
import { writeFileSync } from "fs";

import { formatContractDate, normalizeLanguage, strings } from "@/lib/contract-i18n";
import { renderContractPdf } from "@/lib/contract-pdf";
import { DEFAULT_CONTRACT_TEMPLATE } from "@/lib/contract-template-default";
import { DEFAULT_CONTRACT_TEMPLATE_EN } from "@/lib/contract-template-default-en";
import {
  buildMergeValues,
  renderContract,
  sha256Hex,
  type ContractMergeData,
  type ContractSigner,
} from "@/lib/contracts";

const merge: ContractMergeData = {
  place: "Θεσσαλονίκη",
  studioName: "Six Stories Studio",
  studioLegalName: "Photoshooters O.E.",
  studioCity: "Θεσσαλονίκη",
  studioAddress: "Απ. Παύλου 38",
  studioVatId: "801971850",
  studioTaxOffice: "Δ’ Θεσσαλονίκης",
  studioRepresentatives: "Αριστομένη Καραμπουρνιώτη και Χρήστο Στεργιόπουλο",
  projectTitle: "Γάμος Μαρίας & Νίκου",
  eventDate: "Σάββατο 12 Σεπτεμβρίου 2026",
};

const signers: Record<string, ContractSigner> = {
  el: {
    firstName: "Μαρία",
    lastName: "Παπαδοπούλου",
    city: "Θεσσαλονίκη",
    street: "Τσιμισκή 45",
    isCompany: false,
    companyName: "",
    vatId: "123456789",
    taxOffice: "",
  },
  en: {
    firstName: "Emma",
    lastName: "Whitfield",
    city: "London",
    street: "12 Cavendish Square",
    isCompany: false,
    companyName: "",
    vatId: "094259148",
    taxOffice: "",
  },
};

async function main() {
  const out = process.argv[2] || "/tmp/contract.pdf";
  const language = normalizeLanguage(process.argv[3] || "el");
  const template = language === "en" ? DEFAULT_CONTRACT_TEMPLATE_EN : DEFAULT_CONTRACT_TEMPLATE;
  const signer = signers[language];
  const t = strings(language);

  // "In Thessaloniki, today …" reads better than the Greek genitive in English.
  const mergeForLanguage = language === "en" ? { ...merge, place: "Thessaloniki" } : merge;

  const signedAt = new Date("2026-07-30T12:34:00Z");
  const values = buildMergeValues(
    mergeForLanguage,
    signer,
    formatContractDate(signedAt, language),
    language,
  );
  const rendered = renderContract(template, values);

  const pdf = await renderContractPdf({
    rendered,
    language,
    studioLabel: t.companyLabel,
    studioName: merge.studioLegalName,
    studioSignatureUrl: process.env.SIG_DATA_URI || null,
    clientLabel: t.clientLabel,
    clientName: `${signer.firstName} ${signer.lastName}`,
    signatureKind: "typed",
    signatureData: `${signer.firstName} ${signer.lastName}`,
    audit: {
      contractId: "8f3a1c22-0000-4444-8888-abcdefabcdef",
      signedAtLabel: formatContractDate(signedAt, language),
      signerEmail: language === "en" ? "emma@example.com" : "maria@example.com",
      ip: "212.205.10.44",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605.1.15",
      consentText: template.consentText,
      sentAtLabel: formatContractDate(new Date("2026-07-28T09:00:00Z"), language),
      viewedAtLabel: formatContractDate(new Date("2026-07-29T18:20:00Z"), language),
    },
  });

  writeFileSync(out, pdf);
  console.log(
    `Wrote ${out} [${language}] — ${pdf.length} bytes, sha256=${sha256Hex(pdf).slice(0, 16)}…`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
