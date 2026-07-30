import { createHash, randomBytes, timingSafeEqual } from "crypto";

import { getAppUrl } from "@/lib/env";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function hashContractToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function createContractToken(): { rawToken: string; tokenHash: string; expiresAt: string } {
  const rawToken = randomBytes(32).toString("hex");
  return {
    rawToken,
    tokenHash: hashContractToken(rawToken),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  };
}

export function buildSigningUrl(rawToken: string): string {
  return `${getAppUrl().replace(/\/$/, "")}/sign/${rawToken}`;
}

/** Constant-time compare so token checks cannot be timed. */
export function tokenHashMatches(a: string, b: string): boolean {
  const left = Buffer.from(a || "", "utf8");
  const right = Buffer.from(b || "", "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const time = new Date(expiresAt).getTime();
  return !Number.isFinite(time) || time < Date.now();
}
