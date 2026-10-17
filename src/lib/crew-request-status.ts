// Kept apart from crew-requests.ts, which imports data.ts, so data.ts can map
// the status without a circular import.
export type CrewRequestStatus = "pending" | "emailed" | "seen" | "accepted" | "declined";

export function normalizeCrewRequestStatus(value: unknown): CrewRequestStatus {
  return value === "pending" || value === "emailed" || value === "seen" || value === "declined"
    ? value
    : "accepted";
}
