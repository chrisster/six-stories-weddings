/**
 * The compact per-asset record the public gallery page ships to the browser.
 * With the public media domain configured, every URL is derived on the client
 * from `key` and the shared media base, which keeps the payload for a
 * thousand-photo gallery to a few hundred bytes per asset instead of three
 * full URLs each. Without it (local dev, Supabase fallback) the explicit
 * `url`/`thumb`/`small` fields carry signed URLs.
 */
export type GalleryAsset = {
  id: string;
  /** Storage key, or an absolute URL for demo assets. */
  key: string;
  type: "photo" | "video";
  section: string;
  /** Original file name, for display and downloads. */
  name: string;
  /** Oriented pixel size, when known; lets the grid lay rows out before the images load. */
  w: number | null;
  h: number | null;
  /** Poster frame URL for videos. */
  poster: string | null;
  /** Explicit URLs, only when the media base is unavailable (or for videos). */
  url?: string;
  thumb?: string;
  small?: string;
};

export type GalleryAssetUrls = {
  /** The original (download-quality) file. */
  full: string;
  /** 1600px preview: lightbox and large grid rows. */
  large: string;
  /** 480px preview: cards and phone-sized grid rows. */
  small: string;
  /** On-demand resize route, tried when a stored preview is missing. */
  fallback: string | null;
};

export function assetUrls(asset: GalleryAsset, mediaBase: string | null): GalleryAssetUrls {
  const external = asset.key.startsWith("http://") || asset.key.startsWith("https://");
  if (external) {
    return { full: asset.key, large: asset.key, small: asset.key, fallback: null };
  }

  if (asset.url) {
    return {
      full: asset.url,
      large: asset.thumb ?? asset.url,
      small: asset.small ?? asset.thumb ?? asset.url,
      fallback: null,
    };
  }

  const base = (mediaBase || "").replace(/\/$/, "");
  const params = new URLSearchParams({ path: asset.key, w: "1000", q: "72" });
  return {
    full: `${base}/${asset.key}`,
    large: `${base}/thumbs/${asset.key}.webp`,
    small: `${base}/thumbs/sm/${asset.key}.webp`,
    fallback: `/api/media/thumb?${params.toString()}`,
  };
}
