import { getMediaThumbUrl, getPublicMediaBase, getSignedMediaUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The image at the top of a gallery email.
 *
 * `gallery_notification_templates.hero_image_url` is an override the studio
 * typed in by hand. When it is empty the email follows the gallery: the
 * uploaded hero image if there is one, otherwise the cover photo's preview. So
 * changing the hero or the cover changes the next email as well.
 *
 * The settings form used to prefill that field with whichever image was
 * current and save it straight back, which froze the URL on the first save.
 * Those frozen values point at the studio's own media hosts, so a stored URL
 * on one of those hosts is read as "follow the gallery", not as an override.
 */

export type GalleryHeroSource = {
  heroImagePath: string | null;
  coverStoragePath: string | null;
};

/** Long enough for an email to be opened later, where a signed URL is needed at all. */
const EMAIL_SIGNED_URL_TTL = 60 * 60 * 24 * 30;

export function isStudioMediaUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  if (value.startsWith("/api/media/")) return true;

  const base = getPublicMediaBase();
  if (base && value.startsWith(`${base}/`)) return true;

  try {
    const { hostname, pathname } = new URL(value);
    return (
      hostname.endsWith(".r2.dev") ||
      hostname === "media.sixstoriesstudio.com" ||
      (hostname.endsWith(".supabase.co") && pathname.startsWith("/storage/"))
    );
  } catch {
    return false;
  }
}

/** What the template stores: an external image URL, or null to follow the gallery. */
export function normalizeHeroOverride(value: string | null | undefined): string | null {
  const trimmed = (value || "").trim();
  if (!trimmed || isStudioMediaUrl(trimmed)) return null;
  return trimmed;
}

/** The uploaded hero image, else the cover photo's 1600px preview. */
export async function resolveGalleryHeroUrl(source: GalleryHeroSource): Promise<string | null> {
  if (source.heroImagePath) {
    const url = await getSignedMediaUrl(source.heroImagePath, EMAIL_SIGNED_URL_TTL).catch(
      () => null,
    );
    if (url) return url;
  }
  return source.coverStoragePath ? getMediaThumbUrl(source.coverStoragePath, { size: "lg" }) : null;
}

/** The email hero for a gallery: the stored override when there is one, else the gallery's own. */
export function resolveEmailHeroUrl(
  stored: string | null | undefined,
  galleryHeroUrl: string | null,
): string | null {
  return normalizeHeroOverride(stored) ?? galleryHeroUrl;
}

/**
 * Loads what the hero would be right now: the uploaded hero image, else the
 * photo flagged as cover, else the first photo in the gallery.
 */
export async function getGalleryHeroSource(galleryId: string): Promise<GalleryHeroSource> {
  const admin = createAdminClient();
  if (!admin || !galleryId) return { heroImagePath: null, coverStoragePath: null };

  const [{ data: gallery }, { data: photos }] = await Promise.all([
    admin.from("galleries").select("hero_image_path").eq("id", galleryId).maybeSingle(),
    admin
      .from("media_assets")
      .select("storage_path, is_cover, sort_order")
      .eq("gallery_id", galleryId)
      .eq("media_type", "photo")
      .order("is_cover", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1),
  ]);

  return {
    heroImagePath: (gallery?.hero_image_path as string | null) || null,
    coverStoragePath: (photos?.[0]?.storage_path as string | null) || null,
  };
}
