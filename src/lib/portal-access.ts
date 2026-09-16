import { getClientIdsForEmail } from "@/lib/data";
import { getAppUrl } from "@/lib/env";
import { sendGalleryNotificationEmail } from "@/lib/gallery-notifications";
import {
  claimTokenMatchesPassword,
  createPortalClaimToken,
  verifyPortalClaimToken,
} from "@/lib/portal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// The forgot-password forms are public, so one address gets at most one link
// per window however often someone submits it.
const REQUEST_COOLDOWN_MS = 1000 * 60 * 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PortalAccessLinkResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "invalid_email" | "no_access" | "inactive" | "cooldown" }
  | { status: "failed"; reason: "unavailable" | "not_configured" | "send_failed" };

export type PortalClaim = {
  email: string;
  accountId: string | null;
  passwordHash: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function clientHasPublishedGallery(email: string) {
  const clients = await getClientIdsForEmail(email);
  const admin = createAdminClient();
  if (clients.length === 0 || !admin) {
    return false;
  }

  const { data: links } = await admin
    .from("project_clients")
    .select("project_id")
    .in(
      "client_id",
      clients.map((client) => client.id),
    );
  const projectIds = Array.from(new Set((links || []).map((row) => String(row.project_id))));
  if (projectIds.length === 0) {
    return false;
  }

  const { data: galleries } = await admin
    .from("galleries")
    .select("id")
    .in("project_id", projectIds)
    .eq("is_published", true)
    .limit(1);

  return (galleries || []).length > 0;
}

function buildPortalAccessEmail({
  claimUrl,
  loginUrl,
  recipientName,
  hasPassword,
  requestedByClient,
}: {
  claimUrl: string;
  loginUrl: string;
  recipientName: string;
  hasPassword: boolean;
  requestedByClient: boolean;
}) {
  const subject = hasPassword
    ? "Reset your Six Stories client portal password"
    : "Set your Six Stories client portal password";
  const heading = hasPassword ? "Choose a new password" : "Set your portal password";
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";
  const intro = requestedByClient
    ? "we received a request to set a new password for the Six Stories client portal, where your gallery is waiting."
    : "Six Stories Studio sent you this link so you can set a password for the client portal, where your gallery is waiting.";
  const validity = "The link is valid for 7 days and works once.";
  const ignore =
    requestedByClient && hasPassword
      ? "If you did not ask for this, you can ignore this email: your current password keeps working."
      : "";
  const button = "Set your password";

  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;background:#f3f1ee;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;">
        <p style="margin:0 0 8px;color:#2d2d2d;letter-spacing:0.12em;text-transform:uppercase;">Six Stories</p>
        <h1 style="margin:0 0 16px;font-size:20px;color:#202020;">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 16px;color:#474747;font-size:14px;line-height:1.7;">
          ${escapeHtml(greeting)} ${escapeHtml(intro)} ${escapeHtml(validity)}
        </p>
        <p style="margin:0 0 24px;">
          <a href="${escapeHtml(claimUrl)}" style="display:inline-block;padding:12px 22px;background:#1c1c1c;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.08em;">${escapeHtml(button)}</a>
        </p>
        ${ignore ? `<p style="margin:0 0 16px;color:#474747;font-size:14px;line-height:1.7;">${escapeHtml(ignore)}</p>` : ""}
        <p style="margin:0;color:#8a857d;font-size:12px;line-height:1.6;">
          If the button does not work, copy and paste this link:<br />${escapeHtml(claimUrl)}
        </p>
        <p style="margin:16px 0 0;color:#8a857d;font-size:12px;line-height:1.6;">
          Portal sign-in: <a href="${escapeHtml(loginUrl)}" style="color:#8a857d;">${escapeHtml(loginUrl)}</a>
        </p>
      </div>
    </div>`;

  const text = [
    heading,
    `${greeting} ${intro} ${validity}`,
    `${button}: ${claimUrl}`,
    ignore || null,
    `Portal sign-in: ${loginUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}

/**
 * Emails a client a link that sets their portal password, whether or not they
 * have one. `requestedByClient` marks the public forgot-password forms: those
 * are throttled and only reach addresses that already have a portal account or
 * belong to a client with a published gallery. The link always goes to the
 * address itself, so asking for someone else's only lands in their inbox.
 */
export async function sendPortalAccessLink({
  email,
  fullName,
  requestedByClient,
}: {
  email: string;
  fullName?: string | null;
  requestedByClient: boolean;
}): Promise<PortalAccessLinkResult> {
  const normalized = (email || "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    return { status: "skipped", reason: "invalid_email" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { status: "failed", reason: "unavailable" };
  }

  const { data: existing } = await admin
    .from("client_portal_accounts")
    .select("id, full_name, password_hash, is_active, last_notified_at")
    .eq("email", normalized)
    .maybeSingle();

  if (existing && !existing.is_active) {
    return { status: "skipped", reason: "inactive" };
  }

  if (requestedByClient) {
    if (!existing && !(await clientHasPublishedGallery(normalized))) {
      return { status: "skipped", reason: "no_access" };
    }

    const lastSentAt = existing?.last_notified_at
      ? new Date(String(existing.last_notified_at)).getTime()
      : 0;
    if (Date.now() - lastSentAt < REQUEST_COOLDOWN_MS) {
      return { status: "skipped", reason: "cooldown" };
    }
  }

  let account = existing;
  if (!account) {
    const { data: created } = await admin
      .from("client_portal_accounts")
      .upsert(
        {
          email: normalized,
          full_name: fullName || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      )
      .select("id, full_name, password_hash, is_active, last_notified_at")
      .single();
    if (!created) {
      return { status: "failed", reason: "unavailable" };
    }
    account = created;
  }

  const passwordHash = (account.password_hash as string | null) || null;
  const appUrl = getAppUrl().replace(/\/$/, "");
  const token = createPortalClaimToken(normalized, passwordHash);
  const message = buildPortalAccessEmail({
    claimUrl: `${appUrl}/portal/claim?token=${encodeURIComponent(token)}`,
    loginUrl: `${appUrl}/portal/login`,
    recipientName: String(fullName || account.full_name || "").trim(),
    hasPassword: Boolean(passwordHash),
    requestedByClient,
  });

  try {
    const result = await sendGalleryNotificationEmail({
      to: normalized,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (!result.sent) {
      return { status: "failed", reason: "not_configured" };
    }
  } catch (error) {
    console.error("Could not send portal access link", { email: normalized, error });
    return { status: "failed", reason: "send_failed" };
  }

  await admin
    .from("client_portal_accounts")
    .update({ last_notified_at: new Date().toISOString() })
    .eq("id", account.id);

  return { status: "sent" };
}

/**
 * Resolves a claim link to the account it may set a password for: a valid
 * signature, not expired, an account that is not deactivated, and a password
 * unchanged since the link was issued.
 */
export async function resolvePortalClaim(token: string): Promise<PortalClaim | null> {
  const claim = verifyPortalClaimToken((token || "").trim());
  const admin = createAdminClient();
  if (!claim || !admin) {
    return null;
  }

  const { data: account, error } = await admin
    .from("client_portal_accounts")
    .select("id, password_hash, is_active")
    .eq("email", claim.email)
    .maybeSingle();

  if (error || (account && !account.is_active)) {
    return null;
  }

  const passwordHash = (account?.password_hash as string | null) || null;
  if (!claimTokenMatchesPassword(claim, passwordHash)) {
    return null;
  }

  return {
    email: claim.email,
    accountId: account ? String(account.id) : null,
    passwordHash,
  };
}
