import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getClientPortalSecret } from "@/lib/env";

const PORTAL_COOKIE = "ss_client_portal";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const CLAIM_MAX_AGE = 60 * 60 * 24 * 7;

type PortalSessionPayload = {
  type: "session";
  accountId: string;
  email: string;
  exp: number;
};

type PortalClaimPayload = {
  type: "claim";
  email: string;
  exp: number;
};

export type PortalSession = {
  accountId: string;
  email: string;
};

function getSecretBuffer() {
  const secret = getClientPortalSecret();
  return secret ? Buffer.from(secret) : null;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function signPayload(payload: PortalSessionPayload | PortalClaimPayload) {
  const secret = getSecretBuffer();
  if (!secret) {
    throw new Error("Missing client portal secret");
  }

  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyPayload<T extends PortalSessionPayload | PortalClaimPayload>(token: string): T | null {
  const secret = getSecretBuffer();
  if (!secret) {
    return null;
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = createHmac("sha256", secret).update(body).digest();
  const candidate = Buffer.from(signature, "base64url");
  if (expected.length !== candidate.length || !timingSafeEqual(expected, candidate)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(body)) as T;
    if (!parsed?.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function createPortalSession(accountId: string, email: string) {
  const cookieStore = await cookies();
  const token = signPayload({
    type: "session",
    accountId,
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  });

  cookieStore.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearPortalSession() {
  const cookieStore = await cookies();
  cookieStore.set(PORTAL_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = verifyPayload<PortalSessionPayload>(token);
  if (!payload || payload.type !== "session") {
    return null;
  }

  return {
    accountId: payload.accountId,
    email: payload.email,
  };
}

export async function requirePortalSession() {
  const session = await readPortalSession();
  if (!session) {
    redirect("/portal/login");
  }
  return session;
}

export function createPortalClaimToken(email: string) {
  return signPayload({
    type: "claim",
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + CLAIM_MAX_AGE,
  });
}

export function verifyPortalClaimToken(token: string) {
  const payload = verifyPayload<PortalClaimPayload>(token);
  if (!payload || payload.type !== "claim") {
    return null;
  }
  return { email: payload.email };
}