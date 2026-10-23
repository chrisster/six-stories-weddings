"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import {
  bulkDeleteMediaAction,
  moveMediaToSectionAction,
  reorderMediaAction,
  setCoverMediaAction,
} from "@/app/admin/galleries/[id]/actions";
import type { MediaAsset, GallerySection } from "@/lib/types";

type MediaManagerProps = {
  media: Array<
    MediaAsset & {
      url: string;
      thumbUrl?: string;
      /** On-demand resize route retried when the stored thumbnail is missing. */
      thumbFallbackUrl?: string | null;
      posterUrl?: string | null;
      broken: boolean;
    }
  >;
  sections: GallerySection[];
  galleryId: string;
};

type SortOption = "custom" | "name" | "date";
type SortDirection = "asc" | "desc";

// Natural, case-insensitive order: IMG_2 before IMG_10, "a" next to "A".
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function fileName(item: Pick<MediaAsset, "originalName" | "storagePath">) {
  return item.originalName?.trim() || item.storagePath.split("/").pop() || "";
}

function uploadTime(item: Pick<MediaAsset, "createdAt">) {
  const time = item.createdAt ? Date.parse(item.createdAt) : NaN;
  return Number.isFinite(time) ? time : 0;
}

/**
 * The order an admin sort choice produces. It is written to sort_order, so the
 * client gallery shows exactly this order. "custom" keeps the current order
 * (reversed when descending).
 */
function orderFor<T extends MediaAsset>(items: T[], sortBy: SortOption, direction: SortDirection): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let primary = 0;
    if (sortBy === "name") primary = nameCollator.compare(fileName(a), fileName(b));
    else if (sortBy === "date") primary = uploadTime(a) - uploadTime(b);
    return sign * (primary || a.sortOrder - b.sortOrder);
  });
}

const sortPreferenceKey = (galleryId: string) => `media-sort:${galleryId}`;

type ThumbnailStatus = "idle" | "capturing" | "saving" | "done" | "error";

/**
 * Captures one frame of a stored video at `timeSeconds` and returns it as a
 * JPEG blob. The frame is read through the same-origin `/api/media/video`
 * proxy — drawing the public R2 URL onto a canvas would taint it (CORS).
 */
async function captureVideoFrame(storagePath: string, timeSeconds: number): Promise<Blob> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = `/api/media/video?path=${encodeURIComponent(storagePath)}`;

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Video load timed out")), 30000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Could not load video"));
      };
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Video seek timed out")), 30000);
      video.onseeked = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Could not seek video"));
      };
      video.currentTime = Math.min(Math.max(0, timeSeconds), Math.max(0, video.duration - 0.05));
    });

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Video has no visible frames");
    }

    // Cap the capture size so the upload stays well under the request limit.
    // The frame is stored exactly as encoded here — the server does not
    // re-process it.
    const scale = Math.min(1, 1600 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas unavailable");
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) {
      throw new Error("Could not encode frame");
    }
    return blob;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export function MediaManager({ media, sections, galleryId }: MediaManagerProps) {
  const router = useRouter();
  const [mediaState, setMediaState] = useState(media);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Which ordering was last applied to this gallery (remembered per browser);
  // the grid itself always shows the saved order, i.e. what clients see.
  const [sortBy, setSortBy] = useState<SortOption>("custom");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [savingOrder, setSavingOrder] = useState(false);
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [previewVideo, setPreviewVideo] = useState<
    { id: string; url: string; name: string; storagePath: string } | null
  >(null);
  const [thumbnailStatus, setThumbnailStatus] = useState<ThumbnailStatus>("idle");
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setMediaState(media);
  }, [media]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(sortPreferenceKey(galleryId)) || "null");
      if (saved && ["custom", "name", "date"].includes(saved.sortBy)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a browser-only preference
        setSortBy(saved.sortBy);
        setSortDirection(saved.sortDirection === "desc" ? "desc" : "asc");
      }
    } catch {
      // Storage unavailable — fall back to "custom".
    }
  }, [galleryId]);

  function rememberSort(nextSortBy: SortOption, nextDirection: SortDirection) {
    setSortBy(nextSortBy);
    setSortDirection(nextDirection);
    try {
      window.localStorage.setItem(
        sortPreferenceKey(galleryId),
        JSON.stringify({ sortBy: nextSortBy, sortDirection: nextDirection }),
      );
    } catch {
      // Ignore storage errors.
    }
  }

  /** Applies a sort to the whole gallery and saves it as the client order. */
  async function applySort(nextSortBy: SortOption, nextDirection: SortDirection) {
    if (savingOrder) return;
    if (
      sortBy === "custom" &&
      nextSortBy !== "custom" &&
      !confirm("Re-order the whole gallery? Clients will see this order and any hand-arranged order is replaced.")
    ) {
      return;
    }
    const ordered = orderFor(mediaState, nextSortBy, nextDirection);
    const next = ordered.map((item, index) => ({ ...item, sortOrder: index + 1 }));
    rememberSort(nextSortBy, nextDirection);
    setMediaState(next);
    setSavingOrder(true);
    try {
      await persistOrder(next);
    } finally {
      setSavingOrder(false);
    }
  }

  const sectionMap = useMemo(() => {
    return new Map(sections.map((s) => [s.id, s.name]));
  }, [sections]);

  const groupedAndSorted = useMemo(() => {
    let sorted = [...mediaState];

    // Filter by section
    if (selectedSectionFilter) {
      sorted = sorted.filter((m) => m.sectionId === selectedSectionFilter);
    }

    // Always the saved order — the one the client gallery shows.
    sorted.sort((a, b) => a.sortOrder - b.sortOrder);

    // Group by section
    if (!selectedSectionFilter) {
      const grouped = new Map<string, typeof media>();
      sorted.forEach((item) => {
        const key = item.sectionId
          ? sectionMap.get(item.sectionId) || "Unsorted"
          : "Unsorted";
        const current = grouped.get(key) || [];
        grouped.set(key, [...current, item]);
      });

      // Groups follow the order of the scenes (the one clients see), not the
      // order the first photo of each scene happens to have; whatever has no
      // scene comes last.
      const inSceneOrder = new Map<string, typeof media>();
      sections.forEach((section) => {
        const items = grouped.get(section.name);
        if (items && !inSceneOrder.has(section.name)) inSceneOrder.set(section.name, items);
      });
      grouped.forEach((items, key) => {
        if (!inSceneOrder.has(key)) inSceneOrder.set(key, items);
      });
      return inSceneOrder;
    }

    return new Map([[selectedSectionFilter, sorted]]);
  }, [mediaState, selectedSectionFilter, sectionMap, sections]);

  async function persistOrder(next: typeof mediaState) {
    const orderedIds = [...next]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => item.id)
      .join(",");

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    formData.append("orderedIds", orderedIds);
    // The action revalidates the gallery page itself, which already refreshes
    // this route; a second router.refresh() would render it twice.
    await reorderMediaAction(formData);
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
    // A hand-made change means the gallery no longer follows a name/date sort.
    rememberSort("custom", "asc");
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
      [sectionName]: !(current[sectionName] ?? true),
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
  };

  const handleMoveSelectedToSection = async (sectionId: string) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    formData.append("mediaIds", ids.join(","));
    formData.append("sectionId", sectionId); // empty string => Unsorted

    setMediaState((prev) =>
      prev.map((item) =>
        selectedIds.has(item.id) ? { ...item, sectionId: sectionId || null } : item,
      ),
    );
    setSelectedIds(new Set());
    await moveMediaToSectionAction(formData);
  };

  const handleSetCoverSelected = async () => {
    if (selectedIds.size !== 1) return;
    const [mediaId] = Array.from(selectedIds);

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    formData.append("mediaId", mediaId);

    await setCoverMediaAction(formData);
    setSelectedIds(new Set());
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
  };

  const handleSetVideoThumbnail = async () => {
    if (!previewVideo || thumbnailStatus === "capturing" || thumbnailStatus === "saving") {
      return;
    }

    const time = previewVideoRef.current?.currentTime ?? 0;
    previewVideoRef.current?.pause();
    setThumbnailStatus("capturing");
    setThumbnailError(null);

    let frame: Blob;
    try {
      frame = await captureVideoFrame(previewVideo.storagePath, time);
    } catch {
      setThumbnailStatus("error");
      setThumbnailError("Could not capture the frame. Let the video load a bit and try again.");
      return;
    }

    setThumbnailStatus("saving");
    try {
      const formData = new FormData();
      formData.append("assetId", previewVideo.id);
      formData.append("frame", frame, "frame.jpg");

      const response = await fetch("/api/admin/galleries/video-thumbnail", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Save failed (${response.status})`);
      }

      const data = (await response.json()) as { thumbnailPath?: string; thumbUrl?: string };
      setMediaState((prev) =>
        prev.map((item) =>
          item.id === previewVideo.id
            ? {
                ...item,
                thumbnailPath: data.thumbnailPath || item.thumbnailPath,
                posterUrl: data.thumbUrl || item.posterUrl,
              }
            : item,
        ),
      );
      setThumbnailStatus("done");
      router.refresh();
    } catch (error) {
      setThumbnailStatus("error");
      setThumbnailError(
        `Could not save the thumbnail${error instanceof Error && error.message ? ` — ${error.message}` : ""}.`,
      );
    }
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
      <div className="sticky top-0 z-30 -mx-5 flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
              {sections.length > 0 && (
                <select
                  value=""
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) return;
                    handleMoveSelectedToSection(value === "__unsorted__" ? "" : value);
                    event.target.value = "";
                  }}
                  className="h-7 rounded-full border border-border bg-white px-3 text-xs"
                >
                  <option value="">Move to…</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                  <option value="__unsorted__">Unsorted</option>
                </select>
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
            disabled={savingOrder}
            onChange={(e) => void applySort(e.target.value as SortOption, sortDirection)}
            title="Sets the order clients see"
            className="h-8 rounded-lg border border-border bg-white px-2 text-xs"
          >
            <option value="custom">Custom order</option>
            <option value="name">Sort by name</option>
            <option value="date">Sort by upload date</option>
          </select>
          <button
            type="button"
            disabled={savingOrder}
            onClick={() => void applySort(sortBy, sortDirection === "asc" ? "desc" : "asc")}
            title={sortDirection === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}
            aria-label={sortDirection === "asc" ? "Sort ascending" : "Sort descending"}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white hover:bg-muted disabled:opacity-50"
          >
            {sortDirection === "asc" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
          </button>
          {savingOrder ? <span className="text-xs text-muted-foreground">Saving order…</span> : null}

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
          const isCollapsed = collapsedSections[sectionName] ?? true;
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
                  {/* A row-major grid, so the sort order reads left to right, top to
                      bottom (CSS columns would fill each column top-down instead). */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {sectionMedia.map((asset) => {
                      const selected = selectedIds.has(asset.id);
                      return (
                        <div
                          key={asset.id}
                          draggable
                          onDragStart={() => setDraggedId(asset.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => handleDropInSection(sectionName, asset.id)}
                          onClick={() => handleSelectOne(asset.id)}
                          onDoubleClick={() => {
                            if (asset.mediaType === "video") {
                              setThumbnailStatus("idle");
                              setThumbnailError(null);
                              setPreviewVideo({
                                id: asset.id,
                                url: asset.url,
                                name: asset.originalName || "Video",
                                storagePath: asset.storagePath,
                              });
                            }
                          }}
                          className={`group relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-md border bg-muted/50 transition ${
                            selected
                              ? "border-foreground ring-2 ring-foreground"
                              : "border-border hover:border-foreground/40"
                          }`}
                        >
                          {/* Selection checkbox */}
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleSelectOne(asset.id)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label="Select media"
                            className="absolute top-2 left-2 z-20 h-5 w-5 cursor-pointer rounded border border-white bg-white/90 shadow accent-foreground"
                          />

                          {asset.isCover && (
                            <span className="absolute top-2 right-2 z-10 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                              Cover
                            </span>
                          )}

                          {asset.mediaType === "photo" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={asset.thumbUrl ?? asset.url}
                              alt="Gallery asset"
                              loading="lazy"
                              onError={(event) => {
                                // Stored thumb → on-demand resize route → original.
                                const img = event.currentTarget;
                                const step = Number(img.dataset.fallbackStep || "0");
                                if (step === 0 && asset.thumbFallbackUrl) {
                                  img.dataset.fallbackStep = "1";
                                  img.src = asset.thumbFallbackUrl;
                                } else if (step < 2) {
                                  img.dataset.fallbackStep = "2";
                                  if (img.src !== asset.url) img.src = asset.url;
                                }
                              }}
                              className="block h-full w-full object-contain"
                            />
                          ) : (
                            <>
                              <video
                                src={asset.url}
                                poster={asset.posterUrl || undefined}
                                className="block h-full w-full bg-black object-contain"
                                preload={asset.posterUrl ? "none" : "metadata"}
                                muted
                                playsInline
                              />
                              <span className="pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                                ▶ Double-click to play
                              </span>
                              {asset.originalName ? (
                                <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-[10px] text-white">
                                  {asset.originalName}
                                </span>
                              ) : null}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                </>
              )}
            </div>
          );
        })}
      </div>

      {previewVideo ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewVideo(null)}
        >
          <div
            className="relative w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium text-white">{previewVideo.name}</p>
              <button
                type="button"
                onClick={() => setPreviewVideo(null)}
                className="rounded-full border border-white/40 px-3 py-1 text-xs text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <video
              ref={previewVideoRef}
              src={previewVideo.url}
              className="max-h-[75vh] w-full rounded-lg bg-black"
              controls
              autoPlay
              playsInline
            />
            {!previewVideo.storagePath.includes("://") ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSetVideoThumbnail}
                  disabled={thumbnailStatus === "capturing" || thumbnailStatus === "saving"}
                  className="rounded-full border border-white/40 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50"
                >
                  {thumbnailStatus === "capturing"
                    ? "Capturing frame…"
                    : thumbnailStatus === "saving"
                      ? "Saving thumbnail…"
                      : "Use current frame as thumbnail"}
                </button>
                {thumbnailStatus === "done" ? (
                  <span className="text-xs text-emerald-300">Thumbnail updated ✓</span>
                ) : thumbnailStatus === "error" ? (
                  <span className="text-xs text-red-300">
                    {thumbnailError || "Could not set thumbnail. Try again."}
                  </span>
                ) : (
                  <span className="text-xs text-white/60">
                    Pause on the frame you want, then set it as the video thumbnail.
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
