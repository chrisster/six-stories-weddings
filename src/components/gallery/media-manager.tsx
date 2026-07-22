"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
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

const PAGE_SIZE = 24;

export function MediaManager({ media, sections, galleryId }: MediaManagerProps) {
  const router = useRouter();
  const [mediaState, setMediaState] = useState(media);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [visibleBySection, setVisibleBySection] = useState<Record<string, number>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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

  const toggleSectionCollapsed = (sectionName: string) => {
    setCollapsedSections((current) => ({
      ...current,
      [sectionName]: !current[sectionName],
    }));
  };

  const handleSelectSection = (sectionMedia: Array<{ id: string }>) => {
    const ids = sectionMedia.map((item) => item.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      ids.forEach((id) => next.delete(id));
    } else {
      ids.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedIds.size} selected item(s)?`)) return;

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    formData.append("mediaIds", Array.from(selectedIds).join(","));

    await bulkDeleteMediaAction(formData);
    setMediaState((prev) => prev.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
    router.refresh();
  };

  const handleSetCoverSelected = async () => {
    if (selectedIds.size !== 1) return;
    const [mediaId] = Array.from(selectedIds);

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    formData.append("mediaId", mediaId);

    await setCoverMediaAction(formData);
    setSelectedIds(new Set());
    router.refresh();
  };

  const handleDeleteSection = async (sectionId: string) => {
    const sectionName = sectionMap.get(sectionId);
    if (!confirm(`Delete all photos in "${sectionName}"?`)) return;

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    formData.append("sectionId", sectionId);

    await bulkDeleteMediaAction(formData);
    setMediaState((prev) => prev.filter((item) => item.sectionId !== sectionId));
    setSelectedIds(new Set());
    router.refresh();
  };

  const handleDeleteAll = async () => {
    if (!confirm("Delete all items shown here?")) return;

    // Scope the deletion to the media currently managed here (photos or videos)
    // so a filtered manager never deletes the other media type.
    const ids = mediaState.map((item) => item.id);
    if (ids.length === 0) return;

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    formData.append("mediaIds", ids.join(","));

    await bulkDeleteMediaAction(formData);
    setMediaState([]);
    setSelectedIds(new Set());
    router.refresh();
  };

  if (mediaState.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No media yet. Upload files above or click <strong>Add demo image</strong> to verify
        gallery rendering.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              {selectedIds.size === 1 && (
                <button
                  onClick={handleSetCoverSelected}
                  className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
                >
                  Set as cover
                </button>
              )}
              <button
                onClick={handleDeleteSelected}
                className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
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

      <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
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
          const visibleCount = visibleBySection[sectionName] ?? PAGE_SIZE;
          const visibleMedia = sectionMedia.slice(0, visibleCount);
          const remaining = sectionMedia.length - visibleMedia.length;
          const isCollapsed = Boolean(collapsedSections[sectionName]);
          const allSectionSelected =
            sectionMedia.length > 0 && sectionMedia.every((item) => selectedIds.has(item.id));

          return (
            <div
              id={`section-${sectionName.toLowerCase().replace(/\s+/g, "-")}`}
              key={sectionName}
              className="space-y-3 border-t border-border/70 pt-5"
            >
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleSectionCollapsed(sectionName)}
                  aria-expanded={!isCollapsed}
                  className="flex items-center gap-2 text-left"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      isCollapsed ? "-rotate-90" : ""
                    }`}
                  />
                  <h4 className="text-sm font-medium">{sectionName}</h4>
                  <span className="text-xs text-muted-foreground">{sectionMedia.length} items</span>
                </button>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={allSectionSelected}
                      onChange={() => handleSelectSection(sectionMedia)}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    Select all
                  </label>
                  {sectionId && !selectedSectionFilter && (
                    <button
                      onClick={() => handleDeleteSection(sectionId)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete section
                    </button>
                  )}
                </div>
              </div>

              {!isCollapsed && (
                <>
                  <div className="columns-2 gap-3 sm:columns-3 xl:columns-4 [&>*]:mb-3">
                    {visibleMedia.map((asset) => {
                      const selected = selectedIds.has(asset.id);
                      return (
                        <div
                          key={asset.id}
                          draggable
                          onDragStart={() => setDraggedId(asset.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => handleDropInSection(sectionName, asset.id)}
                          onClick={() => handleSelectOne(asset.id)}
                          className={`group relative block w-full cursor-pointer break-inside-avoid overflow-hidden rounded-md border bg-muted/50 transition ${
                            selected
                              ? "border-foreground ring-2 ring-foreground"
                              : "border-border hover:border-foreground/40"
                          }`}
                        >
                          {/* Selection indicator */}
                          <span
                            className={`absolute top-2 left-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold transition ${
                              selected
                                ? "border-foreground bg-foreground text-background"
                                : "border-white bg-black/40 text-transparent group-hover:text-white"
                            }`}
                          >
                            ✓
                          </span>

                          {asset.isCover && (
                            <span className="absolute top-2 right-2 z-10 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                              Cover
                            </span>
                          )}

                          {asset.mediaType === "photo" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={asset.url}
                              alt="Gallery asset"
                              loading="lazy"
                              className="block w-full"
                            />
                          ) : (
                            <video
                              src={asset.url}
                              className="block w-full"
                              preload="metadata"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {remaining > 0 ? (
                    <div className="flex justify-center pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleBySection((current) => ({
                            ...current,
                            [sectionName]: visibleCount + PAGE_SIZE,
                          }))
                        }
                        className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30"
                      >
                        Load more ({remaining} remaining)
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
