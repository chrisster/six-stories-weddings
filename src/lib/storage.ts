import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "wedding-media";

export async function uploadMediaToStorage(path: string, file: File) {
  const admin = createAdminClient();
  if (!admin) {
    return { path };
  }

  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { path };
}

export async function getSignedMediaUrl(path: string, expiresIn = 60 * 60) {
  const admin = createAdminClient();
  if (!admin) {
    return path;
  }

  // Demo data may use external URLs.
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not sign media URL");
  }

  return data.signedUrl;
}

export function getBucketName() {
  return BUCKET;
}