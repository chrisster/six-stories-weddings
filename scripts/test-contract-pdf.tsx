/**
 * Smoke test for the contract PDF: renders the default template with sample
 * signer data so Greek glyph coverage and layout can be eyeballed.
 *
 *   npx tsx scripts/test-contract-pdf.tsx /tmp/contract.pdf
 */
import { writeFileSync } from "fs";

import { DEFAULT_CONTRACT_TEMPLATE } from "@/lib/contract-template-default";
import { renderContractPdf } from "@/lib/contract-pdf";
import {
  buildMergeValues,
  formatGreekDate,
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

const signer: ContractSigner = {
  firstName: "Μαρία",
  lastName: "Παπαδοπούλου",
  city: "Θεσσαλονίκη",
  street: "Τσιμισκή 45",
  isCompany: false,
  companyName: "",
  vatId: "123456789",
  taxOffice: "",
};

async function main() {
const signedAt = new Date("2026-07-30T12:34:00Z");
const values = buildMergeValues(merge, signer, formatGreekDate(signedAt));
const rendered = renderContract(DEFAULT_CONTRACT_TEMPLATE, values);

const pdf = await renderContractPdf({
  rendered,
  studioLabel: "Η ΕΤΑΙΡΕΙΑ",
  studioName: merge.studioLegalName,
  studioSignatureUrl: null,
  clientLabel: "Ο ΠΕΛΑΤΗΣ",
  clientName: `${signer.firstName} ${signer.lastName}`,
  signatureKind: "typed",
  signatureData: "Μαρία Παπαδοπούλου",
  audit: {
    contractId: "8f3a1c22-0000-4444-8888-abcdefabcdef",
    signedAtLabel: formatGreekDate(signedAt),
    signerEmail: "maria@example.com",
    ip: "212.205.10.44",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605.1.15",
    consentText: DEFAULT_CONTRACT_TEMPLATE.consentText,
    sentAtLabel: formatGreekDate(new Date("2026-07-28T09:00:00Z")),
    viewedAtLabel: formatGreekDate(new Date("2026-07-29T18:20:00Z")),
  },
});

const out = process.argv[2] || "/tmp/contract.pdf";
writeFileSync(out, pdf);
console.log(`Wrote ${out} — ${pdf.length} bytes, sha256=${sha256Hex(pdf).slice(0, 16)}…`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
