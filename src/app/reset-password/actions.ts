"use server";

import { redeemPasswordSetupToken } from "@/lib/password-setup";

export async function setPasswordWithTokenAction(
  token: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  return redeemPasswordSetupToken(token, password);
}
