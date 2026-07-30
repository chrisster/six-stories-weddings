import { DEFAULT_CONTRACT_TEMPLATE } from "@/lib/contract-template-default";
import {
  canSendContractEmails,
  renderContractInviteEmail,
  renderContractSignedEmail,
  resolveContractCcEmail,
} from "@/lib/contract-notifications";
import { renderContractPdf } from "@/lib/contract-pdf";
import {
  buildSigningUrl,
  createContractToken,
  hashContractToken,
  isExpired,
} from "@/lib/contract-tokens";
import {
  buildMergeValues,
  buildPreviewValues,
  formatGreekDate,
  formatGreekDateFromIso,
  renderContract,
  sha256Hex,
  validateSigner,
  type ContractMergeData,
  type ContractSigner,
  type ContractStatus,
  type ContractTemplateSnapshot,
} from "@/lib/contracts";
import { createNotification } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/env";
import { sendGalleryNotificationEmail } from "@/lib/gallery-notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteStoredObjects,
  getMediaBytes,
  getSignedMediaUrl,
  uploadMediaToStorage,
} from "@/lib/storage";

const CONTRACT_STORAGE_PREFIX = "contracts";

export type ContractEventKind =
  | "created"
  | "sent"
  | "reminder_sent"
  | "viewed"
  | "signed"
  | "copy_emailed"
  | "voided"
  | "pdf_downloaded";

export type ContractRecord = {
  id: string;
  projectId: string | null;
  projectTitle: string | null;
  status: ContractStatus;
  recipientEmail: string;
  recipientName: string | null;
  templateSnapshot: ContractTemplateSnapshot;
  mergeData: ContractMergeData;
  signer: ContractSigner | null;
  signatureKind: "drawn" | "typed" | null;
  signatureData: string | null;
  consentText: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  expiresAt: string | null;
  pdfPath: string | null;
  pdfSha256: string | null;
  voidReason: string | null;
  folderId: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function logContractEvent(
  contractId: string,
  kind: ContractEventKind,
  options: { meta?: Record<string, unknown>; ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const admin = createAdminClient();
  if (!admin || !contractId) return;
  await admin.from("contract_events").insert({
    contract_id: contractId,
    kind,
    meta: options.meta ?? {},
    ip: options.ip || null,
    user_agent: options.userAgent || null,
  });
}

export type ContractEvent = {
  id: string;
  kind: ContractEventKind;
  meta: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export async function listContractEvents(contractId: string): Promise<ContractEvent[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin
    .from("contract_events")
    .select("id, kind, meta, ip, user_agent, created_at")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: String(row.id),
    kind: row.kind as ContractEventKind,
    meta: (row.meta ?? {}) as Record<string, unknown>,
    ip: row.ip ?? null,
    userAgent: row.user_agent ?? null,
    createdAt: String(row.created_at),
  }));
}

// ---------------------------------------------------------------------------
// Studio side / template
// ---------------------------------------------------------------------------

type OrgContractSettings = ContractMergeData & {
  studioName: string;
  signatureImageUrl: string | null;
  contractCcEmail: string | null;
  replyToEmail: string | null;
};

export async function getOrgContractSettings(): Promise<OrgContractSettings> {
  const admin = createAdminClient();
  const fallback: OrgContractSettings = {
    place: "Θεσσαλονίκη",
    studioLegalName: "Photoshooters O.E.",
    studioCity: "Θεσσαλονίκη",
    studioAddress: "Απ. Παύλου 38",
    studioVatId: "801971850",
    studioTaxOffice: "Δ’ Θεσσαλονίκης",
    studioRepresentatives: "Αριστομένη Καραμπουρνιώτη και Χρήστο Στεργιόπουλο",
    projectTitle: "",
    eventDate: "",
    studioName: "Six Stories Studio",
    signatureImageUrl: null,
    contractCcEmail: null,
    replyToEmail: null,
  };
  if (!admin) return fallback;

  const { data } = await admin
    .from("organization_settings")
    .select(
      "studio_name, legal_name, vat_id, tax_office, representative_name, address, city, signature_image_url, contract_cc_email, reply_to_email",
    )
    .eq("id", "default")
    .maybeSingle();

  if (!data) return fallback;

  return {
    ...fallback,
    place: data.city || fallback.place,
    studioCity: data.city || fallback.studioCity,
    studioLegalName: data.legal_name || fallback.studioLegalName,
    studioAddress: data.address || fallback.studioAddress,
    studioVatId: data.vat_id || fallback.studioVatId,
    studioTaxOffice: data.tax_office || fallback.studioTaxOffice,
    studioRepresentatives: data.representative_name || fallback.studioRepresentatives,
    studioName: data.studio_name || fallback.studioName,
    signatureImageUrl: data.signature_image_url ?? null,
    contractCcEmail: data.contract_cc_email ?? null,
    replyToEmail: data.reply_to_email ?? null,
  };
}

/** Active template, falling back to the built-in default when none is seeded. */
export async function getActiveContractTemplate(): Promise<{
  id: string | null;
  snapshot: ContractTemplateSnapshot;
}> {
  const admin = createAdminClient();
  if (!admin) return { id: null, snapshot: DEFAULT_CONTRACT_TEMPLATE };

  const { data } = await admin
    .from("contract_templates")
    .select("id, name, version, language, title, intro, clauses, closing, consent_text")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { id: null, snapshot: DEFAULT_CONTRACT_TEMPLATE };

  return {
    id: String(data.id),
    snapshot: {
      name: data.name,
      version: Number(data.version),
      language: data.language || "el",
      title: data.title,
      intro: data.intro || "",
      clauses: Array.isArray(data.clauses) ? data.clauses : [],
      closing: data.closing || "",
      consentText: data.consent_text || DEFAULT_CONTRACT_TEMPLATE.consentText,
    },
  };
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type ContractRow = Record<string, unknown> & {
  projects?: { title?: string | null } | null;
};

function mapContract(row: ContractRow): ContractRecord {
  const hasSigner = Boolean(row.signer_first_name || row.signer_last_name || row.signer_vat_id);
  return {
    id: String(row.id),
    projectId: (row.project_id as string) ?? null,
    projectTitle: row.projects?.title ?? null,
    status: row.status as ContractStatus,
    recipientEmail: String(row.recipient_email),
    recipientName: (row.recipient_name as string) ?? null,
    templateSnapshot: row.template_snapshot as ContractTemplateSnapshot,
    mergeData: row.merge_data as ContractMergeData,
    signer: hasSigner
      ? {
          firstName: (row.signer_first_name as string) || "",
          lastName: (row.signer_last_name as string) || "",
          city: (row.signer_city as string) || "",
          street: (row.signer_street as string) || "",
          isCompany: Boolean(row.signer_is_company),
          companyName: (row.signer_company_name as string) || "",
          vatId: (row.signer_vat_id as string) || "",
          taxOffice: (row.signer_tax_office as string) || "",
        }
      : null,
    signatureKind: (row.signature_kind as "drawn" | "typed") ?? null,
    signatureData: (row.signature_data as string) ?? null,
    consentText: (row.consent_text as string) ?? null,
    sentAt: (row.sent_at as string) ?? null,
    viewedAt: (row.viewed_at as string) ?? null,
    signedAt: (row.signed_at as string) ?? null,
    expiresAt: (row.expires_at as string) ?? null,
    pdfPath: (row.pdf_path as string) ?? null,
    pdfSha256: (row.pdf_sha256 as string) ?? null,
    voidReason: (row.void_reason as string) ?? null,
    folderId: (row.folder_id as string) ?? null,
    createdAt: String(row.created_at),
  };
}

const CONTRACT_COLUMNS =
  "id, project_id, template_id, template_snapshot, merge_data, recipient_email, recipient_name, " +
  "status, expires_at, sent_at, viewed_at, signed_at, signer_first_name, signer_last_name, " +
  "signer_city, signer_street, signer_is_company, signer_company_name, signer_vat_id, " +
  "signer_tax_office, signer_email, signature_kind, signature_data, consent_text, pdf_path, " +
  "pdf_sha256, void_reason, folder_id, created_at";

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

/**
 * @param folderId  A folder id to show only that folder, or `null` for the
 *                  default view of unfiled contracts.
 */
export async function listContracts(folderId: string | null = null): Promise<ContractRecord[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  let query = admin.from("contracts").select(`${CONTRACT_COLUMNS}, projects(title)`);
  query = folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null);

  const { data } = await query.order("created_at", { ascending: false });
  return (data ?? []).map((row) => mapContract(row as ContractRow));
}

export async function getContractById(id: string): Promise<ContractRecord | null> {
  const admin = createAdminClient();
  if (!admin || !id) return null;
  const { data } = await admin
    .from("contracts")
    .select(`${CONTRACT_COLUMNS}, projects(title)`)
    .eq("id", id)
    .maybeSingle();
  return data ? mapContract(data as ContractRow) : null;
}

// ---------------------------------------------------------------------------
// Create + send
// ---------------------------------------------------------------------------

export type SendContractResult =
  | { ok: true; contractId: string; signingUrl: string; emailed: boolean }
  | { ok: false; error: string };

export async function createAndSendContract(args: {
  projectId: string | null;
  recipientEmail: string;
  recipientName: string | null;
  actorEmail?: string | null;
}): Promise<SendContractResult> {
  if (!hasSupabaseEnv) return { ok: false, error: "Το Supabase δεν έχει ρυθμιστεί." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Το Supabase δεν έχει ρυθμιστεί." };

  const recipientEmail = (args.recipientEmail || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
    return { ok: false, error: "Μη έγκυρη διεύθυνση email." };
  }

  const [org, template] = await Promise.all([
    getOrgContractSettings(),
    getActiveContractTemplate(),
  ]);

  // Freeze project details into merge_data so a later project rename cannot
  // change the wording of an already-issued contract.
  let projectTitle = "";
  let eventDate = "";
  if (args.projectId) {
    const { data: project } = await admin
      .from("projects")
      .select("title, event_date")
      .eq("id", args.projectId)
      .maybeSingle();
    projectTitle = project?.title || "";
    eventDate = formatGreekDateFromIso(project?.event_date as string | null) || "";
  }

  // Listed explicitly rather than spreading `org` so mutable operational
  // settings (signature image, CC address, reply-to) never get frozen into the
  // contract's terms.
  const mergeData: ContractMergeData = {
    place: org.place,
    studioName: org.studioName,
    studioLegalName: org.studioLegalName,
    studioCity: org.studioCity,
    studioAddress: org.studioAddress,
    studioVatId: org.studioVatId,
    studioTaxOffice: org.studioTaxOffice,
    studioRepresentatives: org.studioRepresentatives,
    projectTitle,
    eventDate,
  };

  const { rawToken, tokenHash, expiresAt } = createContractToken();

  const { data: inserted, error } = await admin
    .from("contracts")
    .insert({
      project_id: args.projectId,
      template_id: template.id,
      template_snapshot: template.snapshot,
      merge_data: mergeData,
      recipient_email: recipientEmail,
      recipient_name: args.recipientName?.trim() || null,
      status: "sent",
      token_hash: tokenHash,
      expires_at: expiresAt,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message || "Δεν ήταν δυνατή η δημιουργία του συμβολαίου." };
  }

  const contractId = String(inserted.id);
  const signingUrl = buildSigningUrl(rawToken);

  await logContractEvent(contractId, "created", {
    meta: { actor: args.actorEmail || null, templateVersion: template.snapshot.version },
  });

  const emailed = await sendContractInvite({
    contractId,
    recipientEmail,
    recipientName: args.recipientName,
    contractTitle: template.snapshot.title,
    projectTitle,
    signingUrl,
    studioName: org.studioName,
    expiresAt,
    isReminder: false,
  });

  return { ok: true, contractId, signingUrl, emailed };
}

async function sendContractInvite(args: {
  contractId: string;
  recipientEmail: string;
  recipientName: string | null | undefined;
  contractTitle: string;
  projectTitle: string | null;
  signingUrl: string;
  studioName: string;
  expiresAt: string | null;
  isReminder: boolean;
  actorEmail?: string | null;
}): Promise<boolean> {
  if (!canSendContractEmails()) {
    await logContractEvent(args.contractId, args.isReminder ? "reminder_sent" : "sent", {
      meta: { emailed: false, reason: "email_not_configured", actor: args.actorEmail ?? null },
    });
    return false;
  }

  const email = renderContractInviteEmail({
    recipientName: args.recipientName,
    contractTitle: args.contractTitle,
    projectTitle: args.projectTitle,
    signingUrl: args.signingUrl,
    studioName: args.studioName,
    expiresLabel: formatGreekDateFromIso(args.expiresAt, false) || "—",
    isReminder: args.isReminder,
  });

  await sendGalleryNotificationEmail({
    to: args.recipientEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  await logContractEvent(args.contractId, args.isReminder ? "reminder_sent" : "sent", {
    meta: { emailed: true, to: args.recipientEmail, actor: args.actorEmail ?? null },
  });

  return true;
}

/**
 * Re-issues the signing link and re-sends the invite. A fresh token is minted so
 * the previous link stops working — important when a contract is resent because
 * it went to the wrong address.
 */
export async function resendContract(
  contractId: string,
  actorEmail?: string | null,
): Promise<SendContractResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Το Supabase δεν έχει ρυθμιστεί." };

  const contract = await getContractById(contractId);
  if (!contract) return { ok: false, error: "Το συμβόλαιο δεν βρέθηκε." };
  if (contract.status === "signed") {
    return { ok: false, error: "Το συμβόλαιο έχει ήδη υπογραφεί." };
  }
  if (contract.status === "void") {
    return { ok: false, error: "Το συμβόλαιο έχει ακυρωθεί." };
  }

  const { rawToken, tokenHash, expiresAt } = createContractToken();
  const { error } = await admin
    .from("contracts")
    .update({
      token_hash: tokenHash,
      expires_at: expiresAt,
      status: "sent",
      sent_at: new Date().toISOString(),
      viewed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId);

  if (error) return { ok: false, error: error.message };

  const signingUrl = buildSigningUrl(rawToken);
  const emailed = await sendContractInvite({
    contractId,
    recipientEmail: contract.recipientEmail,
    recipientName: contract.recipientName,
    contractTitle: contract.templateSnapshot.title,
    projectTitle: contract.projectTitle,
    signingUrl,
    studioName: contract.mergeData.studioName ?? "Six Stories Studio",
    expiresAt,
    isReminder: true,
    actorEmail,
  });

  return { ok: true, contractId, signingUrl, emailed };
}

export async function voidContract(
  contractId: string,
  reason: string,
  actorEmail?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Το Supabase δεν έχει ρυθμιστεί." };

  const contract = await getContractById(contractId);
  if (!contract) return { ok: false, error: "Το συμβόλαιο δεν βρέθηκε." };
  if (contract.status === "signed") {
    return { ok: false, error: "Ένα υπογεγραμμένο συμβόλαιο δεν μπορεί να ακυρωθεί." };
  }

  const { error } = await admin
    .from("contracts")
    .update({
      status: "void",
      void_reason: reason.trim() || null,
      // Kill the outstanding signing link.
      token_hash: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId);

  if (error) return { ok: false, error: error.message };

  await logContractEvent(contractId, "voided", {
    meta: { actor: actorEmail || null, reason: reason.trim() || null },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public signing flow
// ---------------------------------------------------------------------------

export type SigningView =
  | { ok: true; contract: ContractRecord; previewHtmlValues: Record<string, string> }
  | { ok: false; reason: "not_found" | "expired" | "signed" | "void" };

/**
 * Loads a contract for the public signing page. Read-only — viewing never
 * consumes the token, so email link scanners cannot invalidate it.
 */
export async function getContractForSigning(rawToken: string): Promise<SigningView> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "not_found" };

  const token = (rawToken || "").trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return { ok: false, reason: "not_found" };

  const { data } = await admin
    .from("contracts")
    .select(`${CONTRACT_COLUMNS}, projects(title)`)
    .eq("token_hash", hashContractToken(token))
    .maybeSingle();

  if (!data) return { ok: false, reason: "not_found" };

  const contract = mapContract(data as ContractRow);
  if (contract.status === "void") return { ok: false, reason: "void" };
  if (contract.status === "signed") return { ok: false, reason: "signed" };
  if (isExpired(contract.expiresAt)) return { ok: false, reason: "expired" };

  return {
    ok: true,
    contract,
    previewHtmlValues: buildPreviewValues(contract.mergeData, null, null),
  };
}

export async function markContractViewed(
  rawToken: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const token = (rawToken || "").trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return;

  const { data } = await admin
    .from("contracts")
    .select("id, status, viewed_at")
    .eq("token_hash", hashContractToken(token))
    .maybeSingle();

  if (!data || data.status === "signed" || data.status === "void") return;

  // Only the first view flips status; later views just add audit rows.
  if (!data.viewed_at) {
    await admin
      .from("contracts")
      .update({
        status: "viewed",
        viewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
  }

  await logContractEvent(String(data.id), "viewed", {
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

export type SignContractInput = {
  rawToken: string;
  firstName: string;
  lastName: string;
  city: string;
  street: string;
  isCompany: boolean;
  companyName: string;
  vatId: string;
  taxOffice: string;
  signatureKind: "drawn" | "typed";
  signatureData: string;
  consentAccepted: boolean;
  ip: string | null;
  userAgent: string | null;
};

export type SignContractResult =
  | { ok: true; contractId: string; emailed: boolean }
  | { ok: false; error?: string; errors?: Record<string, string> };

export async function signContract(input: SignContractInput): Promise<SignContractResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Η υπηρεσία δεν είναι διαθέσιμη." };

  const view = await getContractForSigning(input.rawToken);
  if (!view.ok) {
    const messages: Record<string, string> = {
      not_found: "Ο σύνδεσμος δεν είναι έγκυρος.",
      expired: "Ο σύνδεσμος έχει λήξει. Ζητήστε νέο.",
      signed: "Το συμβόλαιο έχει ήδη υπογραφεί.",
      void: "Το συμβόλαιο έχει ακυρωθεί.",
    };
    return { ok: false, error: messages[view.reason] };
  }

  const contract = view.contract;

  if (!input.consentAccepted) {
    return { ok: false, errors: { consent: "Απαιτείται η συναίνεσή σας για την ηλεκτρονική υπογραφή." } };
  }

  const validation = validateSigner(input);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const signer = validation.signer;

  const signature = (input.signatureData || "").trim();
  if (input.signatureKind === "drawn") {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature)) {
      return { ok: false, errors: { signature: "Σχεδιάστε την υπογραφή σας." } };
    }
    // ~1.4MB of base64 is a generous ceiling for a signature canvas.
    if (signature.length > 1_400_000) {
      return { ok: false, errors: { signature: "Η υπογραφή είναι πολύ μεγάλη." } };
    }
  } else if (signature.length < 3) {
    return { ok: false, errors: { signature: "Γράψτε το ονοματεπώνυμό σας." } };
  }

  const signedAt = new Date();
  const consentText = contract.templateSnapshot.consentText;

  // ---- Render the immutable artifact -------------------------------------
  const values = buildMergeValues(contract.mergeData, signer, formatGreekDate(signedAt));
  const rendered = renderContract(contract.templateSnapshot, values);

  const org = await getOrgContractSettings();
  let studioSignatureUrl: string | null = null;
  if (org.signatureImageUrl) {
    studioSignatureUrl = org.signatureImageUrl;
  }

  const clientName = signer.isCompany && signer.companyName
    ? signer.companyName
    : `${signer.firstName} ${signer.lastName}`.trim();

  const pdf = await renderContractPdf({
    rendered,
    studioLabel: "Η ΕΤΑΙΡΕΙΑ",
    studioName: contract.mergeData.studioLegalName,
    studioSignatureUrl,
    clientLabel: "Ο ΠΕΛΑΤΗΣ",
    clientName,
    signatureKind: input.signatureKind,
    signatureData: signature,
    audit: {
      contractId: contract.id,
      signedAtLabel: formatGreekDate(signedAt),
      signerEmail: contract.recipientEmail,
      ip: input.ip || "—",
      userAgent: (input.userAgent || "—").slice(0, 160),
      consentText,
      sentAtLabel: formatGreekDateFromIso(contract.sentAt) || "—",
      viewedAtLabel: formatGreekDateFromIso(contract.viewedAt) || "—",
    },
  });

  const pdfSha256 = sha256Hex(pdf);
  const pdfPath = `${CONTRACT_STORAGE_PREFIX}/${contract.id}.pdf`;

  try {
    await uploadMediaToStorage(
      pdfPath,
      new File([new Uint8Array(pdf)], `${contract.id}.pdf`, { type: "application/pdf" }),
    );
  } catch (storageError) {
    return {
      ok: false,
      error: `Δεν ήταν δυνατή η αποθήκευση του PDF: ${
        storageError instanceof Error ? storageError.message : "unknown"
      }`,
    };
  }

  // ---- Commit, guarding against a double submit --------------------------
  const { data: updated, error } = await admin
    .from("contracts")
    .update({
      status: "signed",
      signed_at: signedAt.toISOString(),
      signer_first_name: signer.firstName,
      signer_last_name: signer.lastName,
      signer_city: signer.city,
      signer_street: signer.street,
      signer_is_company: signer.isCompany,
      signer_company_name: signer.companyName || null,
      signer_vat_id: signer.vatId,
      signer_tax_office: signer.taxOffice || null,
      signer_email: contract.recipientEmail,
      signature_kind: input.signatureKind,
      signature_data: signature,
      consent_text: consentText,
      signed_ip: input.ip,
      signed_user_agent: input.userAgent,
      pdf_path: pdfPath,
      pdf_sha256: pdfSha256,
      token_hash: null, // single use — the link dies at signature
      updated_at: signedAt.toISOString(),
    })
    .eq("id", contract.id)
    .neq("status", "signed")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: false, error: "Το συμβόλαιο έχει ήδη υπογραφεί." };

  await logContractEvent(contract.id, "signed", {
    ip: input.ip,
    userAgent: input.userAgent,
    meta: { pdfSha256, signatureKind: input.signatureKind, vatId: signer.vatId },
  });

  // ---- Downstream side effects ------------------------------------------
  const emailed = await emailSignedCopy({
    contract,
    signedAt,
    pdf,
    pdfSha256,
    pdfPath,
    ccEmail: resolveContractCcEmail(org.contractCcEmail),
    clientName,
  });

  await confirmProjectAfterSigning(contract, clientName);

  return { ok: true, contractId: contract.id, emailed };
}

async function emailSignedCopy(args: {
  contract: ContractRecord;
  signedAt: Date;
  pdf: Buffer;
  pdfSha256: string;
  pdfPath: string;
  ccEmail: string;
  clientName: string;
}): Promise<boolean> {
  if (!canSendContractEmails()) {
    await logContractEvent(args.contract.id, "copy_emailed", {
      meta: { emailed: false, reason: "email_not_configured" },
    });
    return false;
  }

  let downloadUrl: string | null = null;
  try {
    downloadUrl = await getSignedMediaUrl(args.pdfPath, 60 * 60 * 24 * 30);
  } catch {
    downloadUrl = null;
  }

  const email = renderContractSignedEmail({
    recipientName: args.contract.recipientName || args.clientName,
    contractTitle: args.contract.templateSnapshot.title,
    projectTitle: args.contract.projectTitle,
    studioName: args.contract.mergeData.studioLegalName,
    signedAtLabel: formatGreekDate(args.signedAt),
    pdfSha256: args.pdfSha256,
    downloadUrl,
  });

  const filename = `${args.contract.templateSnapshot.title.replace(/[^\p{L}\p{N}]+/gu, "-")}-${
    args.contract.id.slice(0, 8)
  }.pdf`;

  try {
    await sendGalleryNotificationEmail({
      to: args.contract.recipientEmail,
      cc: args.ccEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [{ filename, content: args.pdf, contentType: "application/pdf" }],
    });
  } catch (sendError) {
    // The signature is already committed — never fail the whole flow because
    // the copy could not go out. Surface it in the audit trail instead.
    await logContractEvent(args.contract.id, "copy_emailed", {
      meta: {
        emailed: false,
        error: sendError instanceof Error ? sendError.message : "unknown",
      },
    });
    return false;
  }

  await logContractEvent(args.contract.id, "copy_emailed", {
    meta: { emailed: true, to: args.contract.recipientEmail, cc: args.ccEmail },
  });
  return true;
}

async function confirmProjectAfterSigning(contract: ContractRecord, clientName: string) {
  const admin = createAdminClient();
  if (!admin || !contract.projectId) return;

  const { data: project } = await admin
    .from("projects")
    .select("id, title, status")
    .eq("id", contract.projectId)
    .maybeSingle();

  if (project && project.status === "unconfirmed") {
    await admin
      .from("projects")
      .update({ status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", contract.projectId);
  }

  const { data: admins } = await admin.from("users").select("email").eq("role", "admin");
  const title = `Υπογεγραμμένο συμβόλαιο: ${clientName}`;
  const body = project?.title
    ? `${contract.templateSnapshot.title} — ${project.title}`
    : contract.templateSnapshot.title;

  await Promise.all(
    (admins ?? [])
      .map((row) => row.email)
      .filter((email): email is string => Boolean(email))
      .map((email) =>
        createNotification(email, {
          type: "contract_signed",
          title,
          body,
          // The list page is the detail view for now; there is no
          // /admin/contracts/[id] route yet.
          link: "/admin/contracts",
        }),
      ),
  );
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export type ContractFolder = {
  id: string;
  name: string;
  isArchive: boolean;
  contractCount: number;
};

export async function listContractFolders(): Promise<ContractFolder[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  const [{ data: folders }, { data: contracts }] = await Promise.all([
    admin
      .from("contract_folders")
      .select("id, name, is_archive")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin.from("contracts").select("folder_id"),
  ]);

  const counts = new Map<string, number>();
  for (const row of contracts ?? []) {
    const key = (row.folder_id as string) ?? "";
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (folders ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    isArchive: Boolean(row.is_archive),
    contractCount: counts.get(String(row.id)) ?? 0,
  }));
}

export async function createContractFolder(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Το Supabase δεν έχει ρυθμιστεί." };

  const trimmed = (name || "").trim();
  if (trimmed.length < 1) return { ok: false, error: "Give the folder a name." };
  if (trimmed.length > 60) return { ok: false, error: "Folder name is too long." };

  const { error } = await admin.from("contract_folders").insert({ name: trimmed });
  if (error) {
    // Unique index on lower(name).
    if (error.code === "23505") return { ok: false, error: "A folder with that name already exists." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function renameContractFolder(
  folderId: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Το Supabase δεν έχει ρυθμιστεί." };

  const trimmed = (name || "").trim();
  if (!trimmed) return { ok: false, error: "Give the folder a name." };

  const { error } = await admin
    .from("contract_folders")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", folderId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Deletes the folder itself. Contracts inside it are preserved — the FK is
 * `on delete set null`, so they simply return to the unfiled view.
 */
export async function deleteContractFolder(
  folderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Το Supabase δεν έχει ρυθμιστεί." };

  const { error } = await admin.from("contract_folders").delete().eq("id", folderId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function moveContractsToFolder(
  contractIds: string[],
  folderId: string | null,
): Promise<{ ok: boolean; moved: number; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, moved: 0, error: "Το Supabase δεν έχει ρυθμιστεί." };

  const ids = contractIds.filter(Boolean);
  if (ids.length === 0) return { ok: false, moved: 0, error: "Nothing selected." };

  const { data, error } = await admin
    .from("contracts")
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .in("id", ids)
    .select("id");

  if (error) return { ok: false, moved: 0, error: error.message };
  return { ok: true, moved: (data ?? []).length };
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/**
 * Permanently deletes contracts, including their stored PDFs and audit trail
 * (contract_events cascades on the FK).
 *
 * This destroys the evidence behind a signed contract, so callers must confirm
 * explicitly. Filing into an archive folder is the non-destructive alternative
 * and is what the UI steers towards.
 */
export async function deleteContracts(
  contractIds: string[],
): Promise<{ ok: boolean; deleted: number; signedDeleted: number; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, deleted: 0, signedDeleted: 0, error: "Το Supabase δεν έχει ρυθμιστεί." };

  const ids = contractIds.filter(Boolean);
  if (ids.length === 0) return { ok: false, deleted: 0, signedDeleted: 0, error: "Nothing selected." };

  const { data: rows } = await admin
    .from("contracts")
    .select("id, status, pdf_path")
    .in("id", ids);

  const targets = rows ?? [];

  // Remove stored PDFs first. A failure here is logged but not fatal — an
  // orphaned object in the bucket is preferable to a half-deleted record set.
  const paths = targets
    .map((row) => row.pdf_path as string | null)
    .filter((path): path is string => Boolean(path));

  if (paths.length > 0) {
    try {
      await deleteStoredObjects(paths);
    } catch {
      // Intentionally swallowed — see above.
    }
  }

  const { data: deleted, error } = await admin
    .from("contracts")
    .delete()
    .in("id", ids)
    .select("id");

  if (error) return { ok: false, deleted: 0, signedDeleted: 0, error: error.message };

  return {
    ok: true,
    deleted: (deleted ?? []).length,
    signedDeleted: targets.filter((row) => row.status === "signed").length,
  };
}

// ---------------------------------------------------------------------------
// PDF retrieval
// ---------------------------------------------------------------------------

export async function getContractPdfBytes(
  contractId: string,
): Promise<{ bytes: Buffer; filename: string } | null> {
  const contract = await getContractById(contractId);
  if (!contract?.pdfPath) return null;

  const stored = await getMediaBytes(contract.pdfPath);
  if (!stored) return null;

  const filename = `${contract.templateSnapshot.title.replace(/[^\p{L}\p{N}]+/gu, "-")}-${
    contract.id.slice(0, 8)
  }.pdf`;

  return { bytes: stored.body, filename };
}
