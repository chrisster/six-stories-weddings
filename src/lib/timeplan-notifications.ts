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
  recipientName,
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
      const locationCell = item.location
        ? mapsLink
          ? `<a href="${escapeHtml(mapsLink)}" style="color:#3652a6;text-decoration:none;">${escapeHtml(item.location)}</a>`
          : escapeHtml(item.location)
        : "&mdash;";
      const notesCell = item.notes ? escapeHtml(item.notes) : "&mdash;";
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #ecebe7;font-size:13px;color:#2f2f2f;white-space:nowrap;vertical-align:top;font-weight:600;">${escapeHtml(item.time || "&mdash;")}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ecebe7;font-size:13px;color:#2f2f2f;vertical-align:top;">${escapeHtml(item.action || "&mdash;")}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ecebe7;font-size:13px;color:#2f2f2f;vertical-align:top;">${locationCell}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ecebe7;font-size:13px;color:#6b6b6b;vertical-align:top;">${notesCell}</td>
        </tr>`;
    })
    .join("");

  const recipientLine = recipientName
    ? `<p style="margin:0 0 18px;color:#6b6b6b;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;">${escapeHtml(recipientName)}</p>`
    : "";

  const html = `
    <div style="margin:0;padding:24px;background:#f3f1ee;font-family:Georgia, 'Times New Roman', serif;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;padding:24px 28px 32px;box-sizing:border-box;">
        <div style="text-align:center;">
          <p style="margin:0;color:#2d2d2d;font-size:18px;letter-spacing:0.12em;text-transform:uppercase;">Six Stories</p>
          <h1 style="margin:24px 0 6px;color:#202020;font-size:22px;letter-spacing:0.24em;text-transform:uppercase;">${escapeHtml(headline)}</h1>
          <p style="margin:0 0 6px;color:#383838;font-size:15px;">${escapeHtml(projectTitle)}</p>
          ${dateLabel ? `<p style="margin:0 0 24px;color:#77726a;font-size:12px;font-style:italic;">${escapeHtml(dateLabel)}</p>` : ""}
        </div>
        ${recipientLine}
        <p style="margin:0 0 20px;color:#474747;font-size:14px;line-height:1.75;">${escapeHtml(intro)}</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
          <thead>
            <tr>
              <th style="padding:8px 12px;border-bottom:2px solid #d9d7d2;text-align:left;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8a857d;">Time</th>
              <th style="padding:8px 12px;border-bottom:2px solid #d9d7d2;text-align:left;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8a857d;">Action</th>
              <th style="padding:8px 12px;border-bottom:2px solid #d9d7d2;text-align:left;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8a857d;">Location</th>
              <th style="padding:8px 12px;border-bottom:2px solid #d9d7d2;text-align:left;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8a857d;">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
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
