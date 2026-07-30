import { createHash } from "crypto";

import { strings, type ContractLanguage } from "@/lib/contract-i18n";

export type ContractClause = {
  heading: string;
  /** Paragraphs are separated by a blank line. */
  body: string;
};

export type ContractTemplateSnapshot = {
  name: string;
  version: number;
  language: string;
  title: string;
  intro: string;
  clauses: ContractClause[];
  closing: string;
  consentText: string;
};

export type ContractStatus = "draft" | "sent" | "viewed" | "signed" | "void";

export type ContractMergeData = {
  place: string;
  studioName: string;
  studioLegalName: string;
  studioCity: string;
  studioAddress: string;
  studioVatId: string;
  studioTaxOffice: string;
  studioRepresentatives: string;
  projectTitle: string;
  eventDate: string;
};

export type ContractSigner = {
  firstName: string;
  lastName: string;
  city: string;
  street: string;
  isCompany: boolean;
  companyName: string;
  vatId: string;
  taxOffice: string;
};

// ---------------------------------------------------------------------------
// Greek ΑΦΜ validation
// ---------------------------------------------------------------------------

/**
 * Validates a Greek ΑΦΜ (tax identification number).
 *
 * Nine digits, where the last is a checksum: each of the first eight digits is
 * weighted by a descending power of two (256…2), and the sum mod 11 mod 10 must
 * equal the final digit. Catches transposed and mistyped digits, which a plain
 * length check does not.
 */
export function isValidAfm(value: string): boolean {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length !== 9) return false;
  // 000000000 passes the checksum arithmetic but is never a real ΑΦΜ.
  if (/^0+$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    sum += Number(digits[i]) * 2 ** (8 - i);
  }
  return (sum % 11) % 10 === Number(digits[8]);
}

export function normalizeAfm(value: string): string {
  return (value || "").replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// Merge fields
// ---------------------------------------------------------------------------

/**
 * Resolves `{{token}}` placeholders. Unknown tokens are left as-is rather than
 * blanked, so a typo in a template shows up plainly in review instead of
 * silently producing a contract with a missing party or address.
 */
export function applyMergeFields(text: string, values: Record<string, string>): string {
  if (!text) return "";
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined || value === null || value === "" ? match : String(value);
  });
}

/**
 * Composes the counterparty sentence. The source document is worded for a
 * private individual ("ο ιδιώτης …"); a company signer needs the legal-entity
 * form with its Δ.Ο.Υ. and representative instead. Keeping this in code rather
 * than as two templates means the clause wording stays in one place.
 */
export function buildClientPartyLine(
  signer: ContractSigner | null,
  language: ContractLanguage = "el",
): string {
  if (!signer) return "";

  const city = signer.city || UNFILLED;
  const street = signer.street || UNFILLED;
  const vatId = signer.vatId || UNFILLED;
  const name = `${signer.firstName} ${signer.lastName}`.trim() || UNFILLED;

  if (language === "en") {
    if (signer.isCompany) {
      return (
        `the company ${signer.companyName || UNFILLED}, headquartered in the city of ${city}, ` +
        `at ${street}, with TIN ${vatId}, registered at the ${signer.taxOffice || UNFILLED} Tax Office, ` +
        `legally represented by ${name}, hereinafter referred to as the "Client"`
      );
    }
    return (
      `the individual ${name}, residing in the city of ${city}, ` +
      `at ${street}, with TIN ${vatId}, hereinafter referred to as the "Client"`
    );
  }

  if (signer.isCompany) {
    return (
      `η εταιρεία ${signer.companyName || UNFILLED}, που εδρεύει στη πόλη ${city}, ` +
      `επί της οδού ${street}, με ΑΦΜ ${vatId}, της Δ.Ο.Υ ${signer.taxOffice || UNFILLED}, ` +
      `νομίμως εκπροσωπούμενη από τον/την ${name}, εφεξής ο «Πελάτης»`
    );
  }

  return (
    `ο ιδιώτης ${name} που κατοικεί στη πόλη ${city}, ` +
    `επί της οδού ${street}, με ΑΦΜ ${vatId}, εφεξής ο «Πελάτης»`
  );
}

export function buildMergeValues(
  merge: ContractMergeData,
  signer: ContractSigner | null,
  signedDate: string | null,
  language: ContractLanguage = "el",
): Record<string, string> {
  const signerName = signer
    ? signer.isCompany && signer.companyName
      ? signer.companyName
      : `${signer.firstName} ${signer.lastName}`.trim()
    : "";

  return {
    client_party: buildClientPartyLine(signer, language),
    place: merge.place,
    signed_date: signedDate || "",
    studio_name: merge.studioName,
    studio_legal_name: merge.studioLegalName,
    studio_city: merge.studioCity,
    studio_address: merge.studioAddress,
    studio_vat_id: merge.studioVatId,
    studio_tax_office: merge.studioTaxOffice,
    studio_representatives: merge.studioRepresentatives,
    project_title: merge.projectTitle,
    event_date: merge.eventDate,
    client_name: signerName,
    client_city: signer?.city || "",
    client_street: signer?.street || "",
    client_vat_id: signer?.vatId || "",
    client_tax_office: signer?.taxOffice || "",
  };
}

/**
 * Placeholder shown for a signer field that is not filled in yet, so the
 * pre-signature preview reads like the original document instead of showing
 * raw `{{client_city}}` tokens to the client.
 */
export const UNFILLED = "……………………";

const BLANK_SIGNER: ContractSigner = {
  firstName: "",
  lastName: "",
  city: "",
  street: "",
  isCompany: false,
  companyName: "",
  vatId: "",
  taxOffice: "",
};

export function buildPreviewValues(
  merge: ContractMergeData,
  signer: ContractSigner | null,
  signedDate: string | null,
  language: ContractLanguage = "el",
): Record<string, string> {
  // Fall back to a blank signer so the counterparty sentence still renders with
  // dotted placeholders, the way the original document reads before signing.
  const values = buildMergeValues(merge, signer ?? BLANK_SIGNER, signedDate, language);
  for (const key of [
    "client_name",
    "client_city",
    "client_street",
    "client_vat_id",
    "client_tax_office",
    "signed_date",
  ]) {
    if (!values[key]) values[key] = UNFILLED;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export type RenderedContract = {
  title: string;
  intro: string[];
  clauses: { heading: string; paragraphs: string[] }[];
  closing: string[];
};

function toParagraphs(text: string, values: Record<string, string>): string[] {
  return applyMergeFields(text, values)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/** Resolves a snapshot into display-ready paragraphs for both HTML and PDF. */
export function renderContract(
  snapshot: ContractTemplateSnapshot,
  values: Record<string, string>,
): RenderedContract {
  return {
    title: applyMergeFields(snapshot.title, values),
    intro: toParagraphs(snapshot.intro, values),
    clauses: snapshot.clauses.map((clause) => ({
      heading: applyMergeFields(clause.heading, values),
      paragraphs: toParagraphs(clause.body, values),
    })),
    closing: toParagraphs(snapshot.closing, values),
  };
}

// ---------------------------------------------------------------------------
// Integrity
// ---------------------------------------------------------------------------

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------
// Signer validation
// ---------------------------------------------------------------------------

export type SignerValidationResult =
  | { ok: true; signer: ContractSigner }
  | { ok: false; errors: Record<string, string> };

export function validateSigner(
  input: {
    firstName: string;
    lastName: string;
    city: string;
    street: string;
    isCompany: boolean;
    companyName: string;
    vatId: string;
    taxOffice: string;
  },
  language: ContractLanguage = "el",
): SignerValidationResult {
  const t = strings(language);
  const errors: Record<string, string> = {};

  const firstName = (input.firstName || "").trim();
  const lastName = (input.lastName || "").trim();
  const city = (input.city || "").trim();
  const street = (input.street || "").trim();
  const companyName = (input.companyName || "").trim();
  const taxOffice = (input.taxOffice || "").trim();
  const vatId = normalizeAfm(input.vatId);

  if (firstName.length < 2) errors.firstName = t.errFirstName;
  if (lastName.length < 2) errors.lastName = t.errLastName;
  if (city.length < 2) errors.city = t.errCity;
  if (street.length < 2) errors.street = t.errStreet;

  if (!vatId) {
    errors.vatId = t.errVatMissing;
  } else if (!isValidAfm(vatId)) {
    errors.vatId = t.errVatInvalid;
  }

  if (input.isCompany) {
    if (companyName.length < 2) errors.companyName = t.errCompanyName;
    if (taxOffice.length < 2) errors.taxOffice = t.errTaxOffice;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    signer: {
      firstName,
      lastName,
      city,
      street,
      isCompany: Boolean(input.isCompany),
      companyName: input.isCompany ? companyName : "",
      vatId,
      taxOffice: input.isCompany ? taxOffice : "",
    },
  };
}
