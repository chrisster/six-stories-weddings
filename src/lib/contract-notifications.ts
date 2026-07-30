import { getGalleryEmailEnv } from "@/lib/env";

function escapeHtml(value: string) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(inner: string) {
  return `
    <div style="margin:0;padding:24px;background:#f3f1ee;font-family:Georgia, 'Times New Roman', serif;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;padding:28px 32px 34px;box-sizing:border-box;">
        <p style="margin:0 0 26px;text-align:center;color:#2d2d2d;font-size:18px;letter-spacing:0.12em;text-transform:uppercase;">Six Stories</p>
        ${inner}
      </div>
    </div>
  `;
}

function button(url: string, label: string) {
  return `
    <div style="text-align:center;margin:26px 0;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 30px;background:#2f2f2f;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;border-radius:2px;">${escapeHtml(label)}</a>
    </div>
  `;
}

const P = "margin:0 0 14px;color:#474747;font-size:14px;line-height:1.75;";

// ---------------------------------------------------------------------------
// 1. "Please review and sign"
// ---------------------------------------------------------------------------

export function renderContractInviteEmail(args: {
  recipientName?: string | null;
  contractTitle: string;
  projectTitle?: string | null;
  signingUrl: string;
  studioName: string;
  expiresLabel: string;
  isReminder?: boolean;
}) {
  const greeting = args.recipientName ? `Αγαπητέ/ή ${args.recipientName},` : "Καλησπέρα σας,";
  const lead = args.isReminder
    ? "Υπενθύμιση: το συμφωνητικό συνεργασίας σας αναμένει ακόμη την υπογραφή σας."
    : `Σας αποστέλλουμε το συμφωνητικό συνεργασίας${args.projectTitle ? ` για «${args.projectTitle}»` : ""} προς υπογραφή.`;

  const subject = args.isReminder
    ? `Υπενθύμιση: ${args.contractTitle} προς υπογραφή`
    : `${args.contractTitle} προς υπογραφή`;

  const html = shell(`
    <h1 style="margin:0 0 6px;text-align:center;color:#202020;font-size:19px;letter-spacing:0.18em;text-transform:uppercase;">${escapeHtml(args.contractTitle)}</h1>
    <p style="margin:0 0 26px;text-align:center;color:#77726a;font-size:12px;font-style:italic;">${escapeHtml(args.studioName)}</p>
    <p style="${P}">${escapeHtml(greeting)}</p>
    <p style="${P}">${escapeHtml(lead)}</p>
    <p style="${P}">Η υπογραφή γίνεται ηλεκτρονικά, μέσα από τον παρακάτω σύνδεσμο. Θα σας ζητηθεί να συμπληρώσετε το ονοματεπώνυμο, την πόλη και τη διεύθυνσή σας, το ΑΦΜ σας και να υπογράψετε.</p>
    ${button(args.signingUrl, "Άνοιγμα & υπογραφή")}
    <p style="${P}">Ο σύνδεσμος είναι προσωπικός και ισχύει έως ${escapeHtml(args.expiresLabel)}. Μην τον προωθήσετε σε τρίτους.</p>
    <p style="${P}">Μόλις υπογράψετε, θα λάβετε αυτόματα αντίγραφο του υπογεγραμμένου συμφωνητικού σε PDF.</p>
    <p style="margin:22px 0 0;color:#8a8580;font-size:12px;line-height:1.6;">Αν ο σύνδεσμος δεν ανοίγει, αντιγράψτε τον στο πρόγραμμα περιήγησής σας:<br />${escapeHtml(args.signingUrl)}</p>
  `);

  const text = [
    args.contractTitle,
    greeting,
    lead,
    `Υπογραφή: ${args.signingUrl}`,
    `Ο σύνδεσμος ισχύει έως ${args.expiresLabel}.`,
    "Μόλις υπογράψετε, θα λάβετε αντίγραφο σε PDF.",
    args.studioName,
  ].join("\n\n");

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// 2. "Your signed copy" (client + studio CC)
// ---------------------------------------------------------------------------

export function renderContractSignedEmail(args: {
  recipientName?: string | null;
  contractTitle: string;
  projectTitle?: string | null;
  studioName: string;
  signedAtLabel: string;
  pdfSha256: string;
  downloadUrl?: string | null;
}) {
  const greeting = args.recipientName ? `Αγαπητέ/ή ${args.recipientName},` : "Καλησπέρα σας,";
  const subject = `Υπογεγραμμένο: ${args.contractTitle}${args.projectTitle ? ` — ${args.projectTitle}` : ""}`;

  const html = shell(`
    <h1 style="margin:0 0 6px;text-align:center;color:#202020;font-size:19px;letter-spacing:0.18em;text-transform:uppercase;">Υπογεγραμμένο συμφωνητικό</h1>
    <p style="margin:0 0 26px;text-align:center;color:#77726a;font-size:12px;font-style:italic;">${escapeHtml(args.contractTitle)}</p>
    <p style="${P}">${escapeHtml(greeting)}</p>
    <p style="${P}">Το συμφωνητικό υπογράφηκε ηλεκτρονικά στις ${escapeHtml(args.signedAtLabel)}. Επισυνάπτεται αντίγραφο σε PDF, υπογεγραμμένο από τα δύο μέρη.</p>
    <p style="${P}">Παρακαλούμε φυλάξτε το αρχείο για το αρχείο σας.</p>
    ${args.downloadUrl ? button(args.downloadUrl, "Λήψη PDF") : ""}
    <p style="margin:22px 0 0;color:#8a8580;font-size:11px;line-height:1.6;">Κωδικός ακεραιότητας αρχείου (SHA-256):<br /><span style="font-family:'Courier New',monospace;word-break:break-all;">${escapeHtml(args.pdfSha256)}</span></p>
    <p style="margin:14px 0 0;color:#8a8580;font-size:12px;line-height:1.6;">${escapeHtml(args.studioName)}</p>
  `);

  const text = [
    "Υπογεγραμμένο συμφωνητικό",
    greeting,
    `Το συμφωνητικό «${args.contractTitle}» υπογράφηκε ηλεκτρονικά στις ${args.signedAtLabel}.`,
    "Επισυνάπτεται αντίγραφο σε PDF.",
    args.downloadUrl ? `Λήψη: ${args.downloadUrl}` : null,
    `SHA-256: ${args.pdfSha256}`,
    args.studioName,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Address CC'd on every signed contract, so the studio always keeps a copy
 * even if the admin who sent it is unavailable. Overridable per-install via
 * organization_settings.contract_cc_email or CONTRACT_CC_EMAIL.
 */
export const DEFAULT_CONTRACT_CC_EMAIL = "sixstoriesstudio@gmail.com";

export function resolveContractCcEmail(orgValue?: string | null): string {
  return (
    (orgValue || "").trim() ||
    (process.env.CONTRACT_CC_EMAIL || "").trim() ||
    DEFAULT_CONTRACT_CC_EMAIL
  );
}

export function canSendContractEmails(): boolean {
  const { apiKey, fromEmail, smtpHost, smtpPort, smtpUser, smtpPass } = getGalleryEmailEnv();
  const hasSmtp = Boolean(smtpHost && smtpPort && smtpUser && smtpPass && fromEmail);
  const hasResend = Boolean(apiKey && fromEmail);
  return hasSmtp || hasResend;
}
