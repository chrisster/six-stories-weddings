import { getAppUrl, getGalleryEmailEnv } from "@/lib/env";
import type { GalleryNotificationTemplate } from "@/lib/types";

type TemplateInput = {
  projectTitle: string;
  galleryTitle: string;
  heroImageUrl?: string | null;
};

type RenderEmailInput = {
  template: GalleryNotificationTemplate;
  galleryUrl: string;
  loginUrl: string;
  claimUrl?: string | null;
  recipientName?: string | null;
};

export function buildDefaultGalleryNotificationTemplate({
  projectTitle,
  galleryTitle,
  heroImageUrl,
}: TemplateInput): GalleryNotificationTemplate {
  return {
    emailSubject: `Your photos: ${projectTitle || galleryTitle}`,
    emailHeadline: "Your gallery is ready",
    emailIntro: `${galleryTitle} by Six Stories Studio`,
    emailBody:
      "Your private gallery is now available in the Six Stories client portal. From there you can view, favorite, and download your photos whenever your gallery settings allow it.",
    buttonLabel: "View gallery",
    shareNote:
      "If you already have portal access, use your existing login. If not, use the button above to claim your access and set your password.",
    heroImageUrl: heroImageUrl || null,
    heroImageOverride: null,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatParagraphs(value: string) {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;color:#474747;font-size:14px;line-height:1.75;">${block.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function renderGalleryNotificationEmail({
  template,
  galleryUrl,
  loginUrl,
  claimUrl,
  recipientName,
}: RenderEmailInput) {
  const actionUrl = claimUrl || loginUrl || galleryUrl;
  const recipientLine = recipientName ? `<p style="margin:0 0 18px;color:#6b6b6b;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;">${escapeHtml(recipientName)}</p>` : "";
  const hero = template.heroImageUrl
    ? `<img src="${escapeHtml(template.heroImageUrl)}" alt="Gallery preview" style="display:block;width:100%;height:auto;border:0;" />`
    : "";

  const html = `
    <div style="margin:0;padding:24px;background:#f3f1ee;font-family:Georgia, 'Times New Roman', serif;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;padding:18px 28px 32px;box-sizing:border-box;">
        <p style="margin:0 0 24px;text-align:center;color:#b3aea7;font-size:10px;letter-spacing:0.16em;">View in a browser</p>
        <div style="text-align:center;">
          <p style="margin:0;color:#2d2d2d;font-size:18px;letter-spacing:0.12em;text-transform:uppercase;">Six Stories</p>
          <h1 style="margin:28px 0 8px;color:#202020;font-size:22px;letter-spacing:0.26em;text-transform:uppercase;">${escapeHtml(template.emailHeadline)}</h1>
          <p style="margin:0 0 30px;color:#77726a;font-size:12px;font-style:italic;">${escapeHtml(template.emailIntro)}</p>
        </div>
        ${hero ? `<div style="margin:0 0 26px;">${hero}</div>` : ""}
        <div style="text-align:center;">
          <h2 style="margin:0 0 22px;color:#383838;font-size:24px;letter-spacing:0.18em;text-transform:uppercase;">${escapeHtml(template.emailHeadline)}</h2>
          <a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin:0 0 28px;padding:14px 28px;background:#eceae6;color:#2f2f2f;text-decoration:none;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;border-radius:2px;">${escapeHtml(template.buttonLabel)}</a>
        </div>
        ${recipientLine}
        ${formatParagraphs(template.emailBody)}
        <p style="margin:22px 0 0;color:#474747;font-size:14px;line-height:1.75;">${escapeHtml(template.shareNote)}</p>
        <p style="margin:18px 0 0;color:#5e5a54;font-size:13px;line-height:1.6;">Portal login: <a href="${escapeHtml(loginUrl)}" style="color:#3652a6;">${escapeHtml(loginUrl)}</a></p>
      </div>
    </div>
  `;

  const text = [
    template.emailHeadline,
    recipientName ? `For: ${recipientName}` : null,
    template.emailBody,
    template.shareNote,
    `Portal login: ${loginUrl}`,
    claimUrl ? `Claim access: ${claimUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { html, text };
}

export function canSendGalleryNotificationEmails() {
  const {
    apiKey,
    fromEmail,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
  } = getGalleryEmailEnv();

  const hasSmtp = Boolean(smtpHost && smtpPort && smtpUser && smtpPass && fromEmail);
  const hasResend = Boolean(apiKey && fromEmail);
  return hasSmtp || hasResend;
}

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export async function sendGalleryNotificationEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  cc?: string | string[];
  /** Used by the contract flow to attach the signed PDF. */
  attachments?: EmailAttachment[];
}) {
  const {
    apiKey,
    fromEmail,
    fromName,
    replyTo,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
  } = getGalleryEmailEnv();

  const from = formatFromAddress(fromEmail, fromName);

  const ccList = (Array.isArray(args.cc) ? args.cc : args.cc ? [args.cc] : [])
    .map((value) => value.trim())
    .filter(Boolean);

  const hasSmtp = Boolean(smtpHost && smtpPort && smtpUser && smtpPass && fromEmail);
  if (hasSmtp) {
    const transporter = await createSmtpTransport({ smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass });

    await transporter.sendMail({
      from,
      to: args.to,
      cc: ccList.length > 0 ? ccList : undefined,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: replyTo || undefined,
      attachments: args.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });

    return { sent: true as const };
  }

  if (!apiKey || !fromEmail) {
    return { sent: false, reason: "missing_env" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      cc: ccList.length > 0 ? ccList : undefined,
      subject: args.subject,
      html: args.html,
      text: args.text,
      reply_to: replyTo || undefined,
      // Resend expects base64-encoded attachment content.
      attachments: args.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content.toString("base64"),
        content_type: attachment.contentType,
      })),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Could not send gallery notification: ${body}`);
  }

  return { sent: true as const };
}

async function createSmtpTransport(env: {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
}) {
  const nodemailer = await import("nodemailer");
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    // Fail within seconds when the host is unreachable (nodemailer waits
    // 2 minutes by default), so the admin sees the error instead of a hang.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
}

export type EmailDeliveryStatus = {
  ok: boolean;
  provider: "smtp" | "resend" | "none";
  /** Where mail is handed off, e.g. "mail.example.com:465". */
  target: string;
  fromEmail: string;
  error: string | null;
  checkedAt: string;
};

// Last check result per server instance. A healthy result is reused for 10
// minutes and a failure for 1, so the admin warning clears soon after a fix
// without every page load opening an SMTP connection.
let cachedStatus: { status: EmailDeliveryStatus; expiresAt: number } | null = null;

/**
 * Checks that emails can go out without sending one: for SMTP it connects and
 * logs in (the step that failed when SMTP_HOST pointed at a Cloudflare-proxied
 * host or had a typo); for Resend it checks the API key is accepted.
 */
export async function checkEmailDelivery(options: { fresh?: boolean } = {}): Promise<EmailDeliveryStatus> {
  if (!options.fresh && cachedStatus && cachedStatus.expiresAt > Date.now()) {
    return cachedStatus.status;
  }

  const env = getGalleryEmailEnv();
  const hasSmtp = Boolean(env.smtpHost && env.smtpPort && env.smtpUser && env.smtpPass && env.fromEmail);
  const base = { fromEmail: env.fromEmail, checkedAt: new Date().toISOString() };
  let status: EmailDeliveryStatus;

  if (hasSmtp) {
    const target = `${env.smtpHost}:${env.smtpPort}`;
    try {
      const transporter = await createSmtpTransport(env);
      await transporter.verify();
      transporter.close();
      status = { ...base, ok: true, provider: "smtp", target, error: null };
    } catch (error) {
      status = {
        ...base,
        ok: false,
        provider: "smtp",
        target,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } else if (env.apiKey && env.fromEmail) {
    try {
      const response = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${env.apiKey}` },
      });
      const body = response.ok ? "" : await response.text();
      // A send-only key cannot list domains but is still valid for sending.
      const ok = response.ok || body.includes("restricted_api_key");
      status = {
        ...base,
        ok,
        provider: "resend",
        target: "api.resend.com",
        error: ok ? null : `Resend rejected the API key (${response.status})`,
      };
    } catch (error) {
      status = {
        ...base,
        ok: false,
        provider: "resend",
        target: "api.resend.com",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
    status = {
      ...base,
      ok: false,
      provider: "none",
      target: "",
      error: "No email provider is configured (SMTP_* or RESEND_API_KEY, plus GALLERY_NOTIFICATIONS_FROM_EMAIL)",
    };
  }

  cachedStatus = { status, expiresAt: Date.now() + (status.ok ? 10 : 1) * 60_000 };
  return status;
}

function formatFromAddress(fromEmail: string, fromName?: string) {
  const email = (fromEmail || "").trim();
  if (!email) return email;
  // Already includes a display name (e.g. "Name <email>").
  if (email.includes("<")) return email;
  const name = (fromName || "").trim();
  if (!name) return email;
  // Escape quotes in the display name for a valid RFC 5322 header.
  const safeName = name.replace(/"/g, "'");
  return `"${safeName}" <${email}>`;
}

export function buildGalleryLinks(gallerySlug: string) {
  const appUrl = getAppUrl().replace(/\/$/, "");
  return {
    galleryUrl: `${appUrl}/g/${gallerySlug}`,
    loginUrl: `${appUrl}/portal/login`,
  };
}