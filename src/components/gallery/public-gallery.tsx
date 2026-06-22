"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

type PublicAsset = {
  id: string;
  sectionId?: string | null;
  sectionName: string;
  mediaType: "photo" | "video";
  url: string;
};

type PublicGalleryProps = {
  assets: PublicAsset[];
  allowDownloads: boolean;
};

export function PublicGallery({ assets, allowDownloads }: PublicGalleryProps) {
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);

  const groupedAssets = useMemo(() => {
    const grouped = new Map<string, PublicAsset[]>();
    assets.forEach((asset) => {
      const key = asset.sectionName || "Moments";
      const current = grouped.get(key) || [];
      grouped.set(key, [...current, asset]);
    });
    return grouped;
  }, [assets]);

  const activeAsset = assets.find((asset) => asset.id === activeAssetId) || null;

  return (
    <>
      <div className="space-y-10">
        {[...groupedAssets.entries()].map(([sectionName, sectionAssets]) => (
          <section key={sectionName} className="space-y-4">
            <h3 className="title-cinematic text-3xl font-semibold">{sectionName}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {sectionAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setActiveAssetId(asset.id)}
                  className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border/70 bg-muted/50"
                >
                  {asset.mediaType === "photo" ? (
                    <Image
                      src={asset.url}
                      alt="Wedding media"
                      fill
                      className="object-cover transition duration-300 group-hover:scale-105"
                      unoptimized
                    />
                  ) : (
                    <video src={asset.url} className="size-full object-cover" preload="metadata" />
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {activeAsset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setActiveAssetId(null)}>
          <div className="relative max-h-[90vh] w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setActiveAssetId(null)}
              className="absolute top-2 right-2 z-10 rounded-full bg-white/90 px-3 py-1 text-xs"
            >
              Close
            </button>

            {activeAsset.mediaType === "photo" ? (
              <div className="relative aspect-video overflow-hidden rounded-2xl">
                <Image src={activeAsset.url} alt="Selected media" fill className="object-contain" unoptimized />
              </div>
            ) : (
              <video src={activeAsset.url} controls autoPlay className="max-h-[85vh] w-full rounded-2xl" />
            )}

            {!allowDownloads ? (
              <p className="mt-3 text-center text-xs text-white/80">Downloads are disabled for this gallery.</p>
            ) : (
              <div className="mt-3 text-center">
                <a href={activeAsset.url} download className="text-sm text-white underline underline-offset-4">
                  Download file
                </a>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}