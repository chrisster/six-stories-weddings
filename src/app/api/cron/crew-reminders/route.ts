import { NextResponse, type NextRequest } from "next/server";

import { sendDueCrewReminders } from "@/lib/crew-requests";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily Vercel Cron (see vercel.json): sends the 1-day and 3-day follow-ups
 * for crew availability requests that are still unanswered. Vercel signs the
 * call with `Authorization: Bearer $CRON_SECRET`; without the secret set the
 * route refuses every caller.
 */
export async function GET(request: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const result = await sendDueCrewReminders();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "reminders_failed" },
      { status: 500 },
    );
  }
}
