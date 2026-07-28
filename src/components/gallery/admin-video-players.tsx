"use client";

import { useCallback } from "react";

import {
  GalleryVideoSection,
  type GalleryVideoAsset,
} from "@/components/gallery/gallery-video-section";

type AdminVideoPlayersProps = {
  videos: GalleryVideoAsset[];
  gallerySlug: string;
  allowDownloads?: boolean;
};

/**
 * Renders the same video player experience used on the public gallery
 * (GalleryVideoSection) inside the admin gallery manager so the studio can
 * watch uploaded films with controls, timestamps, and comments.
 */
export function AdminVideoPlayers({
  videos,
  gallerySlug,
  allowDownloads = true,
}: AdminVideoPlayersProps) {
  const handleDownload = useCallback(
    (video: GalleryVideoAsset) => {
      const link = document.createElement("a");
      link.href = `/g/${gallerySlug}/download?asset=${encodeURIComponent(video.id)}&download=1`;
      if (video.fileName) {
        link.download = video.fileName;
      }
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    [gallerySlug],
  );

  const handleShare = useCallback(
    (_assetId: string) => {
      const url = `${window.location.origin}/g/${gallerySlug}`;
      void navigator.clipboard?.writeText(url).catch(() => {});
    },
    [gallerySlug],
  );

  if (videos.length === 0) {
    return null;
  }

  return (
    <GalleryVideoSection
      videos={videos}
      gallerySlug={gallerySlug}
      allowDownloads={allowDownloads}
      onDownload={handleDownload}
      onShare={handleShare}
      canComment
      commenterName="Six Stories Studio"
    />
  );
}
