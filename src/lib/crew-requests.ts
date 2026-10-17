import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizeCrewRequestStatus, type CrewRequestStatus } from "@/lib/crew-request-status";
import { createNotification } from "@/lib/data";
import { getAppUrl, getClientPortalSecret, hasSupabaseEnv } from "@/lib/env";
import { canSendGalleryNotificationEmails, sendGalleryNotificationEmail } from "@/lib/gallery-notifications";
import { createAdminClient } from "@/lib/supabase/admin";


// Follow-ups go out on the daily cron run. The thresholds sit a few hours under
// one and three days so a request emailed in the afternoon is not pushed to the
// following morning's run.
const FIRST_REMINDER_AFTER_MS = 20 * 60 * 60 * 1000;
const SECOND_REMINDER_AFTER_MS = 68 * 60 * 60 * 1000;
const MAX_REMINDERS = 2;

// ---------------------------------------------------------------------------
// Response links
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(assignmentId: string) {
  return createHmac("sha256", getClientPortalSecret())
    .update(`crew-request:${assignmentId}`)
    .digest("base64url")
    .slice(0, 32);
}

/**
 * The link is the assignment id plus an HMAC of it: stable across reminders,
 * nothing to store, and it stops resolving once the assignment is removed.
 */
export function buildCrewResponseUrl(assignmentId: string) {
  return `${getAppUrl().replace(/\/$/, "")}/crew/respond/${assignmentId}.${sign(assignmentId)}`;
}

function parseCrewResponseToken(token: string): string | null {
  const [id, signature] = (token || "").split(".");
  if (!id || !signature || !UUID.test(id) || !getClientPortalSecret()) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return id.toLowerCase();
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export type CrewRequestDetails = {
  assignmentId: string;
  projectId: string;
  status: CrewRequestStatus;
  reminderCount: number;
  emailedAt: string | null;
  respondedAt: string | null;
  responseNote: string | null;
  role: string;
  fee: number | null;
  crewName: string;
  crewEmail: string;
  projectTitle: string;
  eventDate: string | null;
  services: string | null;
};

const REQUEST_SELECT = `
  id, project_id, assignment_role, participant_type, freelancer_fee,
  request_status, emailed_at, responded_at, response_note, reminder_count,
  crew_member:crew_members(full_name, email, contact_info),
  project:projects(title, event_date, package_category)
`;

function toDetails(row: Record<string, unknown>): CrewRequestDetails {
  const member = (row.crew_member as Record<string, unknown> | null) || {};
  const project = (row.project as Record<string, unknown> | null) || {};
  const isFreelancer = row.participant_type === "freelancer";
  return {
    assignmentId: String(row.id),
    projectId: String(row.project_id),
    status: normalizeCrewRequestStatus(row.request_status),
    reminderCount: Number(row.reminder_count || 0),
    emailedAt: (row.emailed_at as string | null) || null,
    respondedAt: (row.responded_at as string | null) || null,
    responseNote: (row.response_note as string | null) || null,
    role: String(row.assignment_role || ""),
    // In-house crew are not paid per project, so they never see a fee.
    fee: isFreelancer && row.freelancer_fee != null ? Number(row.freelancer_fee) : null,
    crewName: String(member.full_name || ""),
    crewEmail: String(member.email || member.contact_info || "").trim().toLowerCase(),
    projectTitle: String(project.title || ""),
    eventDate: (project.event_date as string | null) || null,
    services: String(project.package_category || "").trim() || null,
  };
}

async function loadRequest(assignmentId: string): Promise<CrewRequestDetails | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("crew_assignments")
    .select(REQUEST_SELECT)
    .eq("id", assignmentId)
    .maybeSingle();
  return data ? toDetails(data as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

function escapeHtml(value: string) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatCrewRequestDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("el-GR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatCrewRequestFee(fee: number) {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(fee);
}

export function crewRequestRows(details: CrewRequestDetails): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Project", details.projectTitle || "—"],
    ["Ημερομηνία", formatCrewRequestDate(details.eventDate)],
    ["Services", details.services || "—"],
    ["Ρόλος", details.role || "—"],
  ];
  if (details.fee != null) rows.push(["Αμοιβή", formatCrewRequestFee(details.fee)]);
  return rows;
}

export function renderCrewRequestEmail(details: CrewRequestDetails, reminder: number) {
  const url = buildCrewResponseUrl(details.assignmentId);
  const firstName = details.crewName.split(" ")[0] || "";
  const greeting = firstName ? `Γεια σου ${firstName},` : "Γεια σου,";
  const dateLabel = formatCrewRequestDate(details.eventDate);
  const subject = reminder > 0
    ? `Υπενθύμιση: διαθεσιμότητα για ${details.projectTitle} (${dateLabel})`
    : `Αίτημα διαθεσιμότητας: ${details.projectTitle} (${dateLabel})`;
  const lead = reminder > 0
    ? "Δεν έχουμε λάβει ακόμα την απάντησή σου για το παρακάτω project. Μπορείς να μας πεις αν είσαι διαθέσιμος/η;"
    : "Θα θέλαμε να είσαι μαζί μας στο παρακάτω project. Δες τις λεπτομέρειες και πες μας αν είσαι διαθέσιμος/η.";
  const rows = crewRequestRows(details);

  const P = "margin:0 0 14px;color:#474747;font-size:14px;line-height:1.75;";
  const table = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:9px 12px 9px 0;color:#8a8580;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:9px 0;color:#202020;font-size:14px;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");
  const buttonStyle =
    "display:inline-block;margin:0 6px 10px;padding:14px 26px;text-decoration:none;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;border-radius:2px;";

  const html = `
    <div lang="el" style="margin:0;padding:24px;background:#f3f1ee;font-family:Georgia, 'Times New Roman', serif;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;padding:28px 32px 34px;box-sizing:border-box;">
        <p style="margin:0 0 26px;text-align:center;color:#2d2d2d;font-size:18px;letter-spacing:0.12em;text-transform:uppercase;">Six Stories</p>
        <h1 style="margin:0 0 22px;text-align:center;color:#202020;font-size:19px;letter-spacing:0.18em;text-transform:uppercase;">Διαθεσιμότητα</h1>
        <p style="${P}">${escapeHtml(greeting)}</p>
        <p style="${P}">${escapeHtml(lead)}</p>
        <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #ece8e3;border-bottom:1px solid #ece8e3;margin:8px 0 6px;">${table}</table>
        <div style="text-align:center;margin:26px 0 12px;">
          <a href="${escapeHtml(`${url}?answer=accept`)}" style="${buttonStyle}background:#2f2f2f;color:#ffffff;">Αποδοχή</a>
          <a href="${escapeHtml(`${url}?answer=decline`)}" style="${buttonStyle}background:#ffffff;color:#2f2f2f;border:1px solid #2f2f2f;">Δεν μπορώ</a>
        </div>
        <p style="margin:22px 0 0;color:#8a8580;font-size:12px;line-height:1.6;">Αν τα κουμπιά δεν λειτουργούν, άνοιξε αυτό το link:<br />${escapeHtml(url)}</p>
      </div>
    </div>
  `;

  const text = [
    "Six Stories — Διαθεσιμότητα",
    greeting,
    lead,
    rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
    `Απάντησε εδώ: ${url}`,
  ].join("\n\n");

  return { subject, html, text };
}

/**
 * Emails the availability request (or a follow-up) for one assignment and
 * moves it to "emailed". Returns the status the assignment ends up in.
 *
 * Fails soft: before migration 0033 is applied the status columns do not
 * exist, so the update errors and the caller keeps the old behaviour.
 */
export async function sendCrewRequest(
  assignmentId: string,
  options: { reminder?: number } = {},
): Promise<{ ok: boolean; status?: CrewRequestStatus; error?: string }> {
  if (!hasSupabaseEnv) return { ok: false, error: "supabase_not_configured" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "supabase_not_configured" };

  const details = await loadRequest(assignmentId);
  if (!details) return { ok: false, error: "not_found" };

  const reminder = options.reminder ?? 0;
  // A row that was just inserted carries the column default ("accepted") until
  // the first email goes out; if that email cannot be sent it must read as
  // "pending", not as confirmed.
  const isFresh = details.status === "accepted" && !details.emailedAt && !details.respondedAt;
  const fail = async (error: string) => {
    if (reminder === 0 && isFresh) await markCrewRequestPending(assignmentId);
    return { ok: false, status: isFresh ? ("pending" as const) : details.status, error };
  };

  if (!details.crewEmail || !details.crewEmail.includes("@")) return fail("no_email");
  if (!canSendGalleryNotificationEmails()) return fail("email_not_configured");

  const email = renderCrewRequestEmail(details, reminder);
  try {
    await sendGalleryNotificationEmail({ to: details.crewEmail, ...email });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "send_failed");
  }

  const now = new Date().toISOString();
  const update =
    reminder > 0
      ? { reminder_count: reminder, last_reminder_at: now }
      : {
          // A resend after the page was opened keeps "seen"; reminders restart.
          request_status: details.status === "seen" ? "seen" : "emailed",
          emailed_at: now,
          reminder_count: 0,
          last_reminder_at: null,
        };
  const { error } = await admin.from("crew_assignments").update(update).eq("id", assignmentId);
  if (error) return { ok: false, error: error.message };

  return { ok: true, status: reminder > 0 ? details.status : (update.request_status as CrewRequestStatus) };
}

/**
 * Leaves an assignment waiting for the studio to send the request by hand —
 * used when crew is added from the new-project form, where no fee is set yet.
 * Errors are ignored so this is harmless before migration 0033.
 */
export async function markCrewRequestPending(assignmentId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("crew_assignments").update({ request_status: "pending" }).eq("id", assignmentId);
}

// ---------------------------------------------------------------------------
// Response page
// ---------------------------------------------------------------------------

export async function getCrewRequestForToken(token: string): Promise<CrewRequestDetails | null> {
  if (!hasSupabaseEnv) return null;
  const assignmentId = parseCrewResponseToken(token);
  return assignmentId ? loadRequest(assignmentId) : null;
}

/** First open of the response page flips "emailed" to "seen". */
export async function markCrewRequestSeen(details: CrewRequestDetails) {
  if (details.status !== "emailed" && details.status !== "pending") return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("crew_assignments")
    .update({ request_status: "seen", seen_at: new Date().toISOString() })
    .eq("id", details.assignmentId)
    .in("request_status", ["emailed", "pending"]);
}

export async function respondToCrewRequest(
  token: string,
  answer: "accepted" | "declined",
  note: string,
): Promise<{ ok: boolean; details?: CrewRequestDetails }> {
  const details = await getCrewRequestForToken(token);
  if (!details) return { ok: false };
  const admin = createAdminClient();
  if (!admin) return { ok: false };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("crew_assignments")
    .update({
      request_status: answer,
      responded_at: now,
      response_note: note.trim().slice(0, 1000) || null,
    })
    .eq("id", details.assignmentId);
  if (error) return { ok: false };

  // Tell the studio admins in the app's notification bell.
  const { data: admins } = await admin.from("users").select("email").eq("role", "admin").eq("active", true);
  const verb = answer === "accepted" ? "accepted" : "declined";
  await Promise.all(
    (admins || []).map((row) =>
      createNotification(String(row.email || ""), {
        type: `crew_request_${verb}`,
        title: `${details.crewName || "A crew member"} ${verb} ${details.projectTitle}`,
        body: `${details.role} · ${formatCrewRequestDate(details.eventDate)}${note.trim() ? ` — “${note.trim().slice(0, 200)}”` : ""}`,
        link: `/admin/projects/${details.projectId}`,
      }),
    ),
  );

  return { ok: true, details: { ...details, status: answer, respondedAt: now, responseNote: note.trim() || null } };
}

// ---------------------------------------------------------------------------
// Daily follow-ups
// ---------------------------------------------------------------------------

/**
 * Sends the 1-day and 3-day follow-ups for requests that are still open.
 * Requests for events that already happened are left alone.
 */
export async function sendDueCrewReminders(now = new Date()) {
  const admin = createAdminClient();
  if (!admin) return { checked: 0, sent: 0, failed: 0 };

  const { data, error } = await admin
    .from("crew_assignments")
    .select("id, emailed_at, reminder_count, project:projects(event_date)")
    .in("request_status", ["emailed", "seen"])
    .lt("reminder_count", MAX_REMINDERS)
    .not("emailed_at", "is", null);
  if (error) throw new Error(error.message);

  const today = now.toISOString().slice(0, 10);
  let sent = 0;
  let failed = 0;
  for (const row of data || []) {
    const project = (row.project as { event_date?: string | null } | null) || null;
    if (project?.event_date && project.event_date < today) continue;
    const age = now.getTime() - new Date(String(row.emailed_at)).getTime();
    const count = Number(row.reminder_count || 0);
    const due =
      (count === 0 && age >= FIRST_REMINDER_AFTER_MS) || (count === 1 && age >= SECOND_REMINDER_AFTER_MS);
    if (!due) continue;
    const result = await sendCrewRequest(String(row.id), { reminder: count + 1 });
    if (result.ok) sent += 1;
    else failed += 1;
  }

  return { checked: data?.length || 0, sent, failed };
}
