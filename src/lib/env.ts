const requiredVars = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

export const hasSupabaseEnv =
  Boolean(requiredVars.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(requiredVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export function getSupabaseEnv() {
  if (!hasSupabaseEnv) {
    throw new Error("Missing Supabase env vars. Check .env.local.");
  }

  return {
    url: requiredVars.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: requiredVars.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getAppUrl() {
  return process.env.APP_URL || "https://admin.sixstoriesstudio.com";
}

export function getClientPortalSecret() {
  return process.env.CLIENT_PORTAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function getGalleryEmailEnv() {
  const smtpPortRaw = process.env.SMTP_PORT || "587";
  const smtpPort = Number(smtpPortRaw);

  return {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.GALLERY_NOTIFICATIONS_FROM_EMAIL || "",
    replyTo: process.env.GALLERY_NOTIFICATIONS_REPLY_TO || "",
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : 587,
    smtpSecure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
  };
}