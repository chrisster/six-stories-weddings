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

export async function sendGalleryNotificationEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
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

  const hasSmtp = Boolean(smtpHost && smtpPort && smtpUser && smtpPass && fromEmail);
  if (hasSmtp) {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: replyTo || undefined,
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
      subject: args.subject,
      html: args.html,
      text: args.text,
      reply_to: replyTo || undefined,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Could not send gallery notification: ${body}`);
  }

  return { sent: true as const };
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