import { getAppUrl } from "@/lib/env";
import type { TimeplanItem } from "@/lib/types";

export type TimeplanAudience = "client" | "crew";

type BuildTimeplanEmailInput = {
  audience: TimeplanAudience;
  projectTitle: string;
  eventDate?: string | null;
  items: TimeplanItem[];
  recipientName?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEventDate(eventDate?: string | null) {
  if (!eventDate) return "";
  const parts = eventDate.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return eventDate;
}

export function buildMapsLink(location?: string | null): string | null {
  const trimmed = (location || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}

export function buildTimeplanEmail({
  audience,
  projectTitle,
  eventDate,
  items,
}: BuildTimeplanEmailInput) {
  const isCrew = audience === "crew";
  const appUrl = getAppUrl().replace(/\/$/, "");
  const dateLabel = formatEventDate(eventDate);

  const subject = isCrew
    ? `Crew call sheet — ${projectTitle}${dateLabel ? ` (${dateLabel})` : ""}`
    : `Your wedding day timeline — ${projectTitle}`;

  const headline = isCrew ? "Crew Call Sheet" : "Your Wedding Day Timeline";

  const intro = isCrew
    ? "Here is the shooting schedule for the day. Please review call times and locations, and arrive prepared at each stage."
    : "We have put together the timeline for your celebration. Here is how the day will flow so you know what to expect at every moment.";

  const rowsHtml = items
    .map((item) => {
      const mapsLink = buildMapsLink(item.location);
      const time = escapeHtml(item.time || "—");
      const action = escapeHtml(item.action || "—");
      const locationHtml = item.location
        ? mapsLink
          ? `<a href="${escapeHtml(mapsLink)}" style="color:#3652a6;text-decoration:none;">${escapeHtml(item.location)}</a>`
          : escapeHtml(item.location)
        : "";
      const locationRow = locationHtml
        ? `<tr>
              <td style="padding:2px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#4a4a4a;line-height:1.5;">
                <span style="display:inline-block;min-width:70px;color:#8a857d;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;">Location</span>
                ${locationHtml}
              </td>
            </tr>`
        : "";
      const notesRow = item.notes
        ? `<tr>
              <td style="padding:2px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#6b6b6b;line-height:1.5;">
                <span style="display:inline-block;min-width:70px;color:#8a857d;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;">Notes</span>
                ${escapeHtml(item.notes)}
              </td>
            </tr>`
        : "";
      return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;margin:0 0 12px;background:#faf9f7;border:1px solid #ecebe7;border-radius:10px;">
          <tr>
            <td style="padding:14px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:700;color:#202020;white-space:nowrap;vertical-align:top;">${time}</td>
                  <td style="padding:0 0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#2f2f2f;line-height:1.4;vertical-align:top;">${action}</td>
                </tr>
                ${locationRow}
                ${notesRow}
              </table>
            </td>
          </tr>
        </table>`;
    })
    .join("");

  const recipientLine = "";

  const html = `
    <div style="margin:0;padding:16px;background:#f3f1ee;font-family:Georgia, 'Times New Roman', serif;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:24px 20px 28px;box-sizing:border-box;">
        <div style="text-align:center;">
          <p style="margin:0;color:#2d2d2d;font-size:18px;letter-spacing:0.12em;text-transform:uppercase;">Six Stories</p>
          <h1 style="margin:20px 0 6px;color:#202020;font-size:20px;letter-spacing:0.2em;text-transform:uppercase;line-height:1.3;">${escapeHtml(headline)}</h1>
          <p style="margin:0 0 6px;color:#383838;font-size:15px;">${escapeHtml(projectTitle)}</p>
          ${dateLabel ? `<p style="margin:0 0 22px;color:#77726a;font-size:12px;font-style:italic;">${escapeHtml(dateLabel)}</p>` : ""}
        </div>
        ${recipientLine}
        <p style="margin:0 0 20px;color:#474747;font-size:14px;line-height:1.75;">${escapeHtml(intro)}</p>
        ${rowsHtml}
        <p style="margin:22px 0 0;color:#5e5a54;font-size:13px;line-height:1.6;">${
          isCrew
            ? "Reply to this email if you have any conflicts or questions about the schedule."
            : "If anything looks off or you would like to adjust the timeline, just reply to this email."
        }</p>
        <p style="margin:18px 0 0;color:#b3aea7;font-size:11px;">Six Stories Studio &middot; <a href="${escapeHtml(appUrl)}" style="color:#b3aea7;">sixstoriesstudio.com</a></p>
      </div>
    </div>
  `;

  const textLines = [
    headline,
    projectTitle,
    dateLabel,
    "",
    intro,
    "",
    ...items.map((item) => {
      const maps = buildMapsLink(item.location);
      return [
        item.time || "--",
        item.action || "--",
        item.location ? `${item.location}${maps ? ` (${maps})` : ""}` : "",
        item.notes || "",
      ]
        .filter(Boolean)
        .join(" | ");
    }),
  ].filter((line) => line !== null && line !== undefined);

  return { subject, html, text: textLines.join("\n") };
}
