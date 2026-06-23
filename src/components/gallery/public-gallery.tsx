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

type SortOption = "date" | "name" | "section";

export function PublicGallery({ assets, allowDownloads }: PublicGalleryProps) {
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("section");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>("");

  const sections = useMemo(() => {
    const sectionSet = new Set<string>();
    assets.forEach((asset) => {
      sectionSet.add(asset.sectionName || "Moments");
    });
    return Array.from(sectionSet).sort();
  }, [assets]);

  const groupedAssets = useMemo(() => {
    let sorted = [...assets];

    // Filter by section
    if (selectedSectionFilter) {
      sorted = sorted.filter((a) => a.sectionName === selectedSectionFilter);
    }

    // Sort
    if (sortBy === "name") {
      sorted.sort((a, b) => {
        const nameA = a.id.split("/").pop() || "";
        const nameB = b.id.split("/").pop() || "";
        return nameA.localeCompare(nameB);
      });
    }

    // Group by section
    const grouped = new Map<string, PublicAsset[]>();
    sorted.forEach((asset) => {
      const key = asset.sectionName || "Moments";
      const current = grouped.get(key) || [];
      grouped.set(key, [...current, asset]);
    });
    return grouped;
  }, [assets, sortBy, selectedSectionFilter]);

  const activeAsset = assets.find((asset) => asset.id === activeAssetId) || null;

  return (
    <>
      {/* Controls */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="quiet-label">Sort</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="h-9 rounded-lg border border-border/70 bg-white px-3 text-sm"
          >
            <option value="section">By section</option>
            <option value="name">By name</option>
            <option value="date">By date added</option>
          </select>
        </div>

        {sections.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="quiet-label">Filter</label>
            <select
              value={selectedSectionFilter}
              onChange={(e) => setSelectedSectionFilter(e.target.value)}
              className="h-9 rounded-lg border border-border/70 bg-white px-3 text-sm"
            >
              <option value="">All sections</option>
              {sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-12">
        {[...groupedAssets.entries()].map(([sectionName, sectionAssets]) => (
          <section key={sectionName} className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="title-cinematic text-3xl font-semibold">{sectionName}</h3>
              <span className="text-xs text-muted-foreground">{sectionAssets.length} items</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {sectionAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setActiveAssetId(asset.id)}
                  className="group relative aspect-[4/3] overflow-hidden rounded-md border border-border/60 bg-muted/40"
                >
                  {asset.mediaType === "photo" ? (
                    <Image
                      src={asset.url}
                      alt="Wedding media"
                      fill
                      className="object-cover transition duration-300 group-hover:scale-[1.03]"
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