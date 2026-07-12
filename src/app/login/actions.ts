"use server";

import { getAppUrl, hasSupabaseEnv } from "@/lib/env";
import { sendGalleryNotificationEmail } from "@/lib/gallery-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sends a password reset link using our own SMTP (via a Supabase-generated
 * recovery link), bypassing Supabase's low shared-email rate limit. Always
 * responds generically so it never reveals whether an account exists.
 */
export async function requestPasswordResetAction(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) {
    return { ok: false, error: "Enter your email above first." };
  }

  if (!hasSupabaseEnv) {
    return { ok: false, error: "Authentication is not configured." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: true };
  }

  const appUrl = getAppUrl().replace(/\/$/, "");
  const redirectTo = `${appUrl}/reset-password`;

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: normalized,
      options: { redirectTo },
    });

    const actionLink = (data?.properties?.action_link as string | undefined) || null;
    if (!error && actionLink) {
      const subject = "Reset your Six Stories Studio password";
      const html = `
        <div style="font-family:Georgia,'Times New Roman',serif;background:#f3f1ee;padding:24px;">
          <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;">
            <p style="margin:0 0 8px;color:#2d2d2d;letter-spacing:0.12em;text-transform:uppercase;">Six Stories</p>
            <h1 style="margin:0 0 16px;font-size:20px;color:#202020;">Reset your password</h1>
            <p style="margin:0 0 16px;color:#474747;font-size:14px;line-height:1.7;">
              We received a request to reset your password. Click below to choose a new one.
              If you did not request this, you can ignore this email.
            </p>
            <p style="margin:0 0 24px;">
              <a href="${actionLink}" style="display:inline-block;padding:12px 22px;background:#1c1c1c;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.08em;">Set a new password</a>
            </p>
            <p style="margin:0;color:#8a857d;font-size:12px;line-height:1.6;">
              If the button does not work, copy and paste this link:<br />${actionLink}
            </p>
          </div>
        </div>`;
      const text = `Reset your Six Stories Studio password:\n\n${actionLink}`;
      await sendGalleryNotificationEmail({ to: normalized, subject, html, text });
    }
  } catch {
    // Swallow errors so we never leak account existence or provider details.
  }

  return { ok: true };
}
