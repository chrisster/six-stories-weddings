"use server";

import { redirect } from "next/navigation";

import { respondToCrewRequest } from "@/lib/crew-requests";

export async function respondToCrewRequestAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const answer = String(formData.get("answer") || "") === "declined" ? "declined" : "accepted";
  const note = String(formData.get("note") || "");
  const result = await respondToCrewRequest(token, answer, note);
  redirect(`/crew/respond/${encodeURIComponent(token)}${result.ok ? "" : "?error=1"}`);
}
