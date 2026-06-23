"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMediaAction,
  bulkDeleteMediaAction,
  reorderMediaAction,
  setCoverMediaAction,
} from "@/app/admin/galleries/[id]/actions";
import type { MediaAsset, GallerySection } from "@/lib/types";

type MediaManagerProps = {
  media: Array<MediaAsset & { url: string; broken: boolean }>;
  sections: GallerySection[];
  galleryId: string;
};

type SortOption = "date" | "name" | "section";
type ViewMode = "strip" | "grid";

export function MediaManager({ media, sections, galleryId }: MediaManagerProps) {
  const router = useRouter();
  const [mediaState, setMediaState] = useState(media);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [viewMode, setViewMode] = useState<ViewMode>("strip");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>("");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    setMediaState(media);
  }, [media]);

  const sectionMap = useMemo(() => {
    return new Map(sections.map((s) => [s.id, s.name]));
  }, [sections]);

  const groupedAndSorted = useMemo(() => {
    let sorted = [...mediaState];

    // Filter by section
    if (selectedSectionFilter) {
      sorted = sorted.filter((m) => m.sectionId === selectedSectionFilter);
    }

    // Sort
    if (sortBy === "name") {
      sorted.sort((a, b) => a.storagePath.localeCompare(b.storagePath));
    } else if (sortBy === "date") {
      sorted.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // Group by section
    if (sortBy === "section" || !selectedSectionFilter) {
      const grouped = new Map<string, typeof media>();
      sorted.forEach((item) => {
        const key = item.sectionId
          ? sectionMap.get(item.sectionId) || "Unsorted"
          : "Unsorted";
        const current = grouped.get(key) || [];
        grouped.set(key, [...current, item]);
      });
      return grouped;
    }

    return new Map([[selectedSectionFilter, sorted]]);
  }, [mediaState, sortBy, selectedSectionFilter, sectionMap]);

  async function persistOrder(next: typeof mediaState) {
    const orderedIds = [...next]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => item.id)
      .join(",");

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    formData.append("orderedIds", orderedIds);
    await reorderMediaAction(formData);
    router.refresh();
  }

  async function handleDropInSection(sectionName: string, targetId: string) {
    if (!draggedId || draggedId === targetId) {
      return;
    }

    const sectionItems = mediaState
      .filter((item) => {
        const key = item.sectionId ? sectionMap.get(item.sectionId) || "Unsorted" : "Unsorted";
        return key === sectionName;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const from = sectionItems.findIndex((item) => item.id === draggedId);
    const to = sectionItems.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) {
      return;
    }

    const reordered = [...sectionItems];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    let cursor = Math.min(...sectionItems.map((item) => item.sortOrder));
    const updates = new Map<string, number>();
    reordered.forEach((item) => {
      updates.set(item.id, cursor);
      cursor += 1;
    });

    const next = mediaState.map((item) =>
      updates.has(item.id) ? { ...item, sortOrder: updates.get(item.id)! } : item,
    );

    setMediaState(next);
    setDraggedId(null);
    await persistOrder(next);
  }

  const handleSelectAll = () => {
    if (selectedIds.size === mediaState.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(mediaState.map((m) => m.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedIds.size} selected item(s)?`)) return;

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    formData.append("mediaIds", Array.from(selectedIds).join(","));

    await bulkDeleteMediaAction(formData);
    setSelectedIds(new Set());
  };

  const handleDeleteSection = async (sectionId: string) => {
    const sectionName = sectionMap.get(sectionId);
    if (!confirm(`Delete all photos in "${sectionName}"?`)) return;

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    formData.append("sectionId", sectionId);

    await bulkDeleteMediaAction(formData);
  };

  const handleDeleteAll = async () => {
    if (!confirm("Delete all photos in this gallery?")) return;

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    formData.append("deleteAll", "true");

    await bulkDeleteMediaAction(formData);
  };

  if (mediaState.length === 0) {
    return (
      <div className="admin-surface p-6 text-sm text-muted-foreground">
        No media yet. Upload files above or click <strong>Add demo image</strong> to verify
        gallery rendering.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="admin-surface flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selectedIds.size === mediaState.length && mediaState.length > 0}
              onChange={handleSelectAll}
              className="h-4 w-4 rounded border-border"
            />
            Select all
          </label>
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleDeleteSelected}
                className="text-xs text-red-600 hover:underline"
              >
                Delete selected
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="h-8 rounded-lg border border-border bg-white px-2 text-xs"
          >
            <option value="date">Sort by date</option>
            <option value="name">Sort by name</option>
            <option value="section">Group by section</option>
          </select>

          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setViewMode("strip")}
              className={`px-2 py-1 text-xs ${viewMode === "strip" ? "bg-muted" : "bg-white"}`}
            >
              Strip
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`px-2 py-1 text-xs ${viewMode === "grid" ? "bg-muted" : "bg-white"}`}
            >
              Grid
            </button>
          </div>

          {sections.length > 0 && (
            <select
              value={selectedSectionFilter}
              onChange={(e) => setSelectedSectionFilter(e.target.value)}
              className="h-8 rounded-lg border border-border bg-white px-2 text-xs"
            >
              <option value="">All sections</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleDeleteAll}
            className="text-xs text-red-600 hover:underline"
          >
            Delete all
          </button>
        </div>
      </div>

      <div className="admin-surface flex flex-wrap gap-2 p-3">
        {[...groupedAndSorted.keys()].map((sectionName) => (
          <a
            key={sectionName}
            href={`#section-${sectionName.toLowerCase().replace(/\s+/g, "-")}`}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {sectionName}
          </a>
        ))}
      </div>

      {/* Media Grid by Section */}
      <div className="space-y-8">
        {[...groupedAndSorted.entries()].map(([sectionName, sectionMedia]) => {
          const sectionId = sections.find((s) => sectionMap.get(s.id) === sectionName)?.id;

          return (
            <div
              id={`section-${sectionName.toLowerCase().replace(/\s+/g, "-")}`}
              key={sectionName}
              className="admin-surface space-y-3 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">{sectionName}</h4>
                  <span className="text-xs text-muted-foreground">{sectionMedia.length} items</span>
                </div>
                {sectionId && !selectedSectionFilter && (
                  <button
                    onClick={() => handleDeleteSection(sectionId)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete section
                  </button>
                )}
              </div>

              <div
                className={
                  viewMode === "strip"
                    ? "flex gap-3 overflow-x-auto pb-2"
                    : "grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6"
                }
              >
                {sectionMedia.map((asset) => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={() => setDraggedId(asset.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDropInSection(sectionName, asset.id)}
                    className={`group relative overflow-hidden rounded-md border border-border bg-muted/50 ${
                      viewMode === "strip" ? "w-40 shrink-0" : "w-full"
                    }`}
                  >
                    {/* Checkbox overlay */}
                    <label className="absolute top-2 left-2 z-10 flex h-5 w-5 items-center justify-center rounded border border-white bg-black/50">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(asset.id)}
                        onChange={() => handleSelectOne(asset.id)}
                        className="h-4 w-4"
                      />
                    </label>

                    {/* Media */}
                    <div className="relative aspect-[4/3]">
                      {asset.mediaType === "photo" ? (
                        <Image
                          src={asset.url}
                          alt="Gallery asset"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <video
                          src={asset.url}
                          className="size-full object-cover"
                          preload="metadata"
                        />
                      )}
                    </div>

                    {/* Actions footer */}
                    <div className="space-y-2 border-t border-border bg-white/90 p-2 backdrop-blur">
                      <p className="text-xs text-muted-foreground">
                        {asset.mediaType} {asset.isCover ? "· cover" : ""}
                      </p>

                      <div className="flex gap-1">
                        <form action={setCoverMediaAction} className="contents">
                          <input type="hidden" name="galleryId" value={galleryId} />
                          <input type="hidden" name="mediaId" value={asset.id} />
                          <button
                            type="submit"
                            className="rounded-full border border-border px-2 py-1 text-[11px] hover:bg-muted"
                          >
                            Cover
                          </button>
                        </form>

                        <form action={deleteMediaAction} className="contents">
                          <input type="hidden" name="galleryId" value={galleryId} />
                          <input type="hidden" name="mediaId" value={asset.id} />
                          <button
                            type="submit"
                            className="rounded-full border border-red-300 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
