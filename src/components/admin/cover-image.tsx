"use client";

/* eslint-disable @next/next/no-img-element */

type CoverImageProps = {
  /** The small preview (480px webp). */
  src: string;
  /** The original, tried when the preview object does not exist yet. */
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
};

/** Card thumbnail that falls back to the original when its preview is missing. */
export function CoverImage({ src, fallbackSrc, alt, className }: CoverImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={(event) => {
        const img = event.currentTarget;
        if (fallbackSrc && img.dataset.fallback !== "1" && img.src !== fallbackSrc) {
          img.dataset.fallback = "1";
          img.src = fallbackSrc;
        }
      }}
    />
  );
}
