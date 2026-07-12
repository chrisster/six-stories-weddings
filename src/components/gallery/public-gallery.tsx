/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  MessageCircle,
  Share2,
  X,
} from "lucide-react";

import { formatDateLong } from "@/lib/utils";
import { GalleryVideoSection, type GalleryVideoAsset } from "@/components/gallery/gallery-video-section";
import { MediaComments } from "@/components/gallery/media-comments";

type PublicAsset = {
  id: string;
  sectionId?: string | null;
  sectionName: string;
  mediaType: "photo" | "video";
  url: string;
  fileName?: string;
};

type PublicGalleryProps = {
  assets: PublicAsset[];
  galleryId: string;
  gallerySlug: string;
  allowDownloads: boolean;
  coupleNames: string;
  eventDate?: string | null;
  coverUrl?: string | null;
  studioName?: string;
  sectionOrder?: string[];
  canComment?: boolean;
  commenterName?: string | null;
  commentCounts?: Record<string, number>;
};

type GroupedSection = {
  name: string;
  items: PublicAsset[];
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PHOTO_PAGE_SIZE = 30;

function displayName(name?: string) {
  if (!name) return "";
  return name.replace(/\.[^./]+$/, "");
}

export function PublicGallery({
  assets,
  galleryId: _galleryId,
  gallerySlug,
  allowDownloads,
  coupleNames,
  eventDate,
  coverUrl,
  studioName = "Six Stories",
  sectionOrder = [],
  canComment = false,
  commenterName = null,
  commentCounts = {},
}: PublicGalleryProps) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharePreviewUrl, setSharePreviewUrl] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [visibleBySection, setVisibleBySection] = useState<Record<string, number>>({});
  const [showComments, setShowComments] = useState(false);
  const sessionRef = useRef<string>("");

  // Establish a per-browser guest identity (the passcode unlock is the client
  // "login"; this id ties favorites to that visitor) and load saved favorites.
  useEffect(() => {
    let id = "";
    try {
      id = localStorage.getItem("ss_guest_session") || "";
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("ss_guest_session", id);
      }
    } catch {
      id = "";
    }
    sessionRef.current = id;
    if (!id) return;

    fetch(`/g/${gallerySlug}/favorites?session=${encodeURIComponent(id)}`)
      .then((response) => response.json())
      .then((data: { favorites?: string[] }) => setFavorites(new Set(data.favorites || [])))
      .catch(() => {});
  }, [gallerySlug]);

  const toggleFavorite = useCallback(
    (assetId: string) => {
      const session = sessionRef.current;
      if (!session) return;

      setFavorites((previous) => {
        const willFavorite = !previous.has(assetId);
        const nextSet = new Set(previous);
        if (willFavorite) nextSet.add(assetId);
        else nextSet.delete(assetId);

        fetch(`/g/${gallerySlug}/favorites`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaAssetId: assetId, session, favorited: willFavorite }),
        }).catch(() => {});

        return nextSet;
      });
    },
    [gallerySlug],
  );

  // Force an instant, same-origin download (no new tab / CORS issue) by routing
  // the file through our own /download proxy with Content-Disposition.
  const downloadAsset = useCallback(
    (asset: PublicAsset) => {
      const token = new URLSearchParams(window.location.search).get("token");
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
      const link = document.createElement("a");
      link.href = `/g/${gallerySlug}/download?asset=${encodeURIComponent(asset.id)}&download=1${tokenParam}`;
      if (asset.fileName) {
        // Hint the browser to keep the original filename for same-origin downloads.
        link.download = asset.fileName;
      }
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    [gallerySlug],
  );

  // Bundle multiple files into a single ZIP. The archive is streamed from the
  // server (so the whole gallery never has to fit in browser memory). Use a
  // normal browser download/navigation flow here because hidden iframes are
  // unreliable for attachment responses across browsers.
  const downloadMany = useCallback(
    (list: PublicAsset[]) => {
      if (list.length === 0) return;
      setDownloading(true);
      const token = new URLSearchParams(window.location.search).get("token");
      const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";

      if (list.length === assets.length) {
        const link = document.createElement("a");
        link.href = `/g/${gallerySlug}/download-zip${tokenQuery}`;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = `/g/${gallerySlug}/download-zip${tokenQuery}`;
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "assets";
        input.value = list.map((asset) => asset.id).join(",");
        form.appendChild(input);
        if (token) {
          const tokenInput = document.createElement("input");
          tokenInput.type = "hidden";
          tokenInput.name = "token";
          tokenInput.value = token;
          form.appendChild(tokenInput);
        }
        document.body.appendChild(form);
        form.requestSubmit();
        form.remove();
      }

      // The browser takes over the download once streaming begins; clear the
      // preparing indicator shortly after.
      window.setTimeout(() => setDownloading(false), 4000);
    },
    [assets.length, gallerySlug],
  );

  const toggleSelect = useCallback((assetId: string) => {
    setSelected((previous) => {
      const nextSet = new Set(previous);
      if (nextSet.has(assetId)) nextSet.delete(assetId);
      else nextSet.add(assetId);
      return nextSet;
    });
  }, []);

  const photoAssets = useMemo(
    () => assets.filter((asset) => asset.mediaType !== "video"),
    [assets],
  );
  const videoAssets = useMemo(
    () => assets.filter((asset) => asset.mediaType === "video"),
    [assets],
  );

  const grouped = useMemo<GroupedSection[]>(() => {
    const map = new Map<string, PublicAsset[]>();
    photoAssets.forEach((asset) => {
      const key = asset.sectionName || "Photos";
      map.set(key, [...(map.get(key) || []), asset]);
    });

    const orderedKeys: string[] = [];
    sectionOrder.forEach((name) => {
      if (map.has(name) && !orderedKeys.includes(name)) orderedKeys.push(name);
    });
    map.forEach((_value, key) => {
      if (!orderedKeys.includes(key)) orderedKeys.push(key);
    });

    return orderedKeys.map((name) => ({ name, items: map.get(name) || [] }));
  }, [assets, sectionOrder]);

  const displayedGroups = useMemo<GroupedSection[]>(() => {
    if (!favoritesOnly) return grouped;
    return grouped
      .map((group) => ({ name: group.name, items: group.items.filter((item) => favorites.has(item.id)) }))
      .filter((group) => group.items.length > 0);
  }, [grouped, favoritesOnly, favorites]);

  const flatOrdered = useMemo(
    () => displayedGroups.flatMap((group) => group.items),
    [displayedGroups],
  );

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<string>(grouped[0]?.name || "");

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const galleryStartRef = useRef<HTMLDivElement>(null);

  const openAt = useCallback(
    (assetId: string) => {
      const index = flatOrdered.findIndex((asset) => asset.id === assetId);
      if (index >= 0) setActiveIndex(index);
    },
    [flatOrdered],
  );

  const close = useCallback(() => {
    setActiveIndex(null);
    setShowComments(false);
  }, []);
  const next = useCallback(
    () => setActiveIndex((current) => (current === null ? current : (current + 1) % flatOrdered.length)),
    [flatOrdered.length],
  );
  const prev = useCallback(
    () =>
      setActiveIndex((current) =>
        current === null ? current : (current - 1 + flatOrdered.length) % flatOrdered.length,
      ),
    [flatOrdered.length],
  );

  // Keyboard navigation for the lightbox.
  useEffect(() => {
    if (activeIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, close, next, prev]);

  // Lock body scroll while the lightbox is open.
  useEffect(() => {
    if (activeIndex === null) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [activeIndex]);

  // Track which section is in view for the sticky nav.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const name = visible.target.getAttribute("data-section");
          if (name) setActiveSection(name);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );

    Object.values(sectionRefs.current).forEach((element) => {
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [displayedGroups]);

  const scrollToSection = useCallback((name: string) => {
    const element = sectionRefs.current[name];
    if (element) {
      const top = element.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }, []);

  const scrollToGallery = useCallback(() => {
    if (galleryStartRef.current) {
      galleryStartRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const createShareLink = useCallback(
    async (options: { shareAll: boolean; assetIds?: string[] }) => {
      const currentToken = new URLSearchParams(window.location.search).get("token") || undefined;
      const response = await fetch(`/g/${gallerySlug}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareAll: options.shareAll,
          assetIds: options.assetIds || [],
          currentToken,
        }),
      });

      if (!response.ok) {
        throw new Error("Could not create share link");
      }

      const data = (await response.json()) as { shareUrl?: string };
      if (!data.shareUrl) {
        throw new Error("No share URL returned");
      }

      return data.shareUrl;
    },
    [gallerySlug],
  );

  const openSharePreview = useCallback((url: string) => {
    setSharePreviewUrl(url);
    setCopySuccess(false);
  }, []);

  const createFullGalleryShare = useCallback(async () => {
    setSharing(true);
    setShareMenuOpen(false);
    try {
      const url = await createShareLink({ shareAll: true });
      openSharePreview(url);
    } catch {
      // ignore errors for now
    } finally {
      setSharing(false);
    }
  }, [createShareLink, openSharePreview]);

  const shareSelection = useCallback(async () => {
    if (selected.size === 0) return;
    setSharing(true);

    try {
      const ids = flatOrdered.filter((asset) => selected.has(asset.id)).map((asset) => asset.id);
      const url = await createShareLink({ shareAll: false, assetIds: ids });
      openSharePreview(url);

      setSelectMode(false);
      setSelected(new Set());
    } catch {
      // ignore errors for now
    } finally {
      setSharing(false);
    }
  }, [createShareLink, flatOrdered, openSharePreview, selected]);

  const shareAsset = useCallback(
    async (assetId: string) => {
      setSharing(true);
      try {
        const url = await createShareLink({ shareAll: false, assetIds: [assetId] });
        openSharePreview(url);
      } catch {
        // ignore errors for now
      } finally {
        setSharing(false);
      }
    },
    [createShareLink, openSharePreview],
  );

  const downloadVideo = useCallback(
    (video: GalleryVideoAsset) => {
      downloadAsset({
        id: video.id,
        sectionName: "Films",
        mediaType: "video",
        url: video.url,
        fileName: video.fileName,
      });
    },
    [downloadAsset],
  );

  const copyShareLink = useCallback(async () => {
    if (!sharePreviewUrl || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(sharePreviewUrl);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 1600);
    } catch {
      setCopySuccess(false);
    }
  }, [sharePreviewUrl]);

  const activeAsset = activeIndex !== null ? flatOrdered[activeIndex] : null;
  const dateLong = formatDateLong(eventDate);
  const favoriteCount = favorites.size;

  return (
    <div className="bg-white text-foreground">
      {/* ---------- HERO ---------- */}
      <header className="flex min-h-screen flex-col justify-center px-4 py-12 sm:py-16">
        <img
          src="/six-stories-logo.png"
          alt={studioName}
          className="mx-auto h-11 w-auto sm:h-14"
        />

        <div className="mt-12 flex flex-1 flex-col items-center justify-center gap-6 md:mt-0 md:flex-row md:gap-12">
          <div className="relative aspect-[3/4] w-[320px] max-w-[82vw] overflow-hidden bg-muted/40 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.5)] sm:w-[400px] md:w-[460px]">
            {coverUrl ? (
              <img src={coverUrl} alt={coupleNames} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-[linear-gradient(135deg,#1c1c1c,#3a3a3a)]" />
            )}
          </div>

          <div className="text-center md:min-w-[160px] md:text-left">
            <h1 className="title-cinematic text-2xl font-medium tracking-wide sm:text-4xl">{coupleNames}</h1>
            <div className="mx-auto my-4 h-px w-10 bg-foreground/30 md:mx-0" />
            {dateLong ? (
              <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{dateLong}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={scrollToGallery}
            aria-label="Scroll to gallery"
            className="rounded-full p-2 text-muted-foreground transition hover:text-foreground"
          >
            <ChevronDown className="size-5" />
          </button>
        </div>
      </header>

      {/* ---------- STICKY NAV ---------- */}
      <nav className="sticky top-0 z-40 border-y border-border/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-4 py-3 sm:px-6">
          <img
            src="/six-stories-logo.png"
            alt={studioName}
            className="h-5 w-auto shrink-0 sm:h-6"
          />

          <div className="flex flex-1 items-center gap-4 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => {
                setFavoritesOnly(false);
                scrollToGallery();
              }}
              className={`text-[11px] uppercase tracking-[0.22em] transition hover:text-foreground ${
                favoritesOnly ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              Gallery
            </button>
            {videoAssets.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setFavoritesOnly(false);
                  scrollToSection("Film");
                }}
                className={`text-[11px] uppercase tracking-[0.22em] transition hover:text-foreground ${
                  !favoritesOnly && activeSection === "Film" ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                Film
              </button>
            ) : null}
            {grouped.map((group) => (
              <button
                key={group.name}
                type="button"
                onClick={() => {
                  setFavoritesOnly(false);
                  scrollToSection(group.name);
                }}
                className={`text-[11px] uppercase tracking-[0.22em] transition hover:text-foreground ${
                  !favoritesOnly && activeSection === group.name ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {group.name}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFavoritesOnly((value) => !value)}
            aria-pressed={favoritesOnly}
            aria-label="Show favorites"
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] uppercase tracking-[0.18em] transition ${
              favoritesOnly ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Heart className={`size-4 ${favoritesOnly ? "fill-current" : ""}`} />
            {favoriteCount > 0 ? <span>{favoriteCount}</span> : null}
          </button>

          {allowDownloads ? (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setDownloadMenuOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={downloadMenuOpen}
                aria-label="Download options"
                className="flex items-center rounded-full p-2 text-muted-foreground transition hover:text-foreground"
              >
                <Download className="size-4" />
              </button>

              {downloadMenuOpen ? (
                <>
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setDownloadMenuOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border/70 bg-white p-3 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)]">
                    <button
                      type="button"
                      disabled={downloading}
                      onClick={() => {
                        setDownloadMenuOpen(false);
                        downloadMany(flatOrdered);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-muted/60 disabled:opacity-50"
                    >
                      <Download className="size-4" />
                      {downloading ? "Preparing…" : `Download all (${flatOrdered.length})`}
                    </button>
                    <p className="mt-2 border-t border-border/60 px-3 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                      For single item downloads, use the download icon on each item.
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                setDownloadMenuOpen(false);
                setShareMenuOpen((value) => !value);
              }}
              aria-haspopup="menu"
              aria-expanded={shareMenuOpen}
              aria-label="Share options"
              disabled={sharing}
              className="shrink-0 rounded-full p-2 text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              <Share2 className="size-4" />
            </button>

            {shareMenuOpen ? (
              <>
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setShareMenuOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-border/70 bg-white p-3 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)]">
                  <button
                    type="button"
                    disabled={sharing}
                    onClick={createFullGalleryShare}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-muted/60 disabled:opacity-50"
                  >
                    <Share2 className="size-4" />
                    {sharing ? "Generating…" : "Share all the gallery"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShareMenuOpen(false);
                      setSelected(new Set());
                      setSelectMode(true);
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-muted/60"
                  >
                    <Check className="size-4" />
                    Select photos to share
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </nav>

      {/* ---------- SELECTION BAR ---------- */}
      {selectMode ? (
        <div className="sticky top-[57px] z-30 flex items-center justify-between gap-3 border-b border-border/70 bg-foreground px-4 py-2.5 text-background sm:px-6">
          <span className="text-[11px] uppercase tracking-[0.2em]">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selected.size === 0 || downloading}
              onClick={() => downloadMany(flatOrdered.filter((asset) => selected.has(asset.id)))}
              className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              <Download className="size-3.5" />
              {downloading ? "Preparing…" : "Download"}
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || sharing}
              onClick={shareSelection}
              className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              <Share2 className="size-3.5" />
              {sharing ? "Sharing…" : "Share"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectMode(false);
                setSelected(new Set());
              }}
              className="rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-background/80 transition hover:text-background"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {sharePreviewUrl ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-4"
          onClick={() => setSharePreviewUrl(null)}
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-border/70 bg-white p-6 shadow-[0_24px_80px_-35px_rgba(0,0,0,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Share Link</p>
                <h3 className="title-cinematic mt-2 text-2xl font-semibold">Link Ready</h3>
              </div>
              <button
                type="button"
                onClick={() => setSharePreviewUrl(null)}
                className="rounded-full p-2 text-muted-foreground transition hover:text-foreground"
                aria-label="Close share link preview"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              Click the field or button to copy this share link.
            </p>

            <button
              type="button"
              onClick={copyShareLink}
              className="mt-4 w-full rounded-2xl border border-border bg-muted/40 px-3 py-3 text-left text-xs text-foreground hover:bg-muted/60"
            >
              <span className="block truncate">{sharePreviewUrl}</span>
            </button>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSharePreviewUrl(null)}
                className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30"
              >
                Close
              </button>
              <button
                type="button"
                onClick={copyShareLink}
                className="rounded-full border border-foreground bg-foreground px-4 py-2 text-sm text-background transition hover:opacity-90"
              >
                {copySuccess ? "Copied" : "Click to copy"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------- FILMS (shown first) ---------- */}
      {!favoritesOnly && videoAssets.length > 0 ? (
        <GalleryVideoSection
          videos={videoAssets.map((asset) => ({
            id: asset.id,
            url: asset.url,
            fileName: asset.fileName,
          }))}
          gallerySlug={gallerySlug}
          allowDownloads={allowDownloads}
          onDownload={downloadVideo}
          onShare={shareAsset}
          canComment={canComment}
          commenterName={commenterName}
          sectionRef={(element) => {
            sectionRefs.current["Film"] = element;
          }}
        />
      ) : null}

      {/* ---------- SECTIONS ---------- */}
      <div ref={galleryStartRef} className="px-2 pb-20 sm:px-4">
        {favoritesOnly && displayedGroups.length === 0 ? (
          <div className="py-24 text-center">
            <Heart className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              No favorites yet. Tap the heart on any photo to save it here.
            </p>
          </div>
        ) : (
          displayedGroups.map((group, index) => {
            const visibleCount = visibleBySection[group.name] ?? PHOTO_PAGE_SIZE;
            const visibleItems = group.items.slice(0, visibleCount);
            const remaining = group.items.length - visibleItems.length;

            return (
              <section
                key={group.name}
                data-section={group.name}
                id={`sec-${slugify(group.name)}-${index}`}
                ref={(element) => {
                  sectionRefs.current[group.name] = element;
                }}
                className="scroll-mt-20"
              >
                <h2 className="title-cinematic py-10 text-center text-sm uppercase tracking-[0.4em] text-foreground/80 sm:py-14">
                  {group.name}
                </h2>
                <JustifiedGrid
                  items={visibleItems}
                  favorites={favorites}
                  allowDownloads={allowDownloads}
                  selectMode={selectMode}
                  selected={selected}
                  commentCounts={commentCounts}
                  onSelect={openAt}
                  onToggleFavorite={toggleFavorite}
                  onToggleSelect={toggleSelect}
                  onDownload={downloadAsset}
                />
                {remaining > 0 ? (
                  <div className="flex justify-center pt-8">
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleBySection((current) => ({
                          ...current,
                          [group.name]: visibleCount + PHOTO_PAGE_SIZE,
                        }))
                      }
                      className="rounded-full border border-foreground/30 px-6 py-2.5 text-[11px] uppercase tracking-[0.22em] text-foreground transition hover:border-foreground"
                    >
                      Load more ({remaining})
                    </button>
                  </div>
                ) : null}
              </section>
            );
          })
        )}
      </div>

      {/* ---------- LIGHTBOX ---------- */}
      {activeAsset ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
          onClick={close}
        >          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 rounded-full p-2 text-white/80 transition hover:text-white"
          >
            <X className="size-6" />
          </button>

          {flatOrdered.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous"
                onClick={(event) => {
                  event.stopPropagation();
                  prev();
                }}
                className="absolute left-2 z-10 rounded-full p-2 text-white/70 transition hover:text-white sm:left-6"
              >
                <ChevronLeft className="size-8" />
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={(event) => {
                  event.stopPropagation();
                  next();
                }}
                className="absolute right-2 z-10 rounded-full p-2 text-white/70 transition hover:text-white sm:right-6"
              >
                <ChevronRight className="size-8" />
              </button>
            </>
          ) : null}

          <div
            className={`flex max-h-[92vh] w-full items-center justify-center px-4 pb-20 transition-all ${
              showComments ? "max-w-3xl sm:pr-[22rem]" : "max-w-6xl"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            {activeAsset.mediaType === "photo" ? (
              <img
                src={activeAsset.url}
                alt={displayName(activeAsset.fileName)}
                className="max-h-[84vh] w-auto max-w-full object-contain"
              />
            ) : (
              <video src={activeAsset.url} controls autoPlay className="max-h-[84vh] w-auto max-w-full" />
            )}
          </div>

          {/* Comments panel */}
          {showComments ? (
            <div
              className="absolute inset-y-0 right-0 z-20 w-full max-w-sm border-l border-border/40 bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowComments(false)}
                aria-label="Close comments"
                className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition hover:text-foreground"
              >
                <X className="size-5" />
              </button>
              <div className="h-full pt-6">
                <MediaComments
                  key={activeAsset.id}
                  gallerySlug={gallerySlug}
                  mediaAssetId={activeAsset.id}
                  canComment={canComment}
                  commenterName={commenterName}
                />
              </div>
            </div>
          ) : null}

          {/* Filename + action bar */}
          <div
            className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 bg-gradient-to-t from-black/70 to-transparent pb-6 pt-10"
            onClick={(event) => event.stopPropagation()}
          >
            {activeAsset.fileName ? (
              <p className="text-xs uppercase tracking-[0.28em] text-white/80">
                {displayName(activeAsset.fileName)}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleFavorite(activeAsset.id)}
                aria-label={favorites.has(activeAsset.id) ? "Remove favorite" : "Add favorite"}
                aria-pressed={favorites.has(activeAsset.id)}
                className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur transition hover:bg-white/20"
              >
                <Heart className={`size-4 ${favorites.has(activeAsset.id) ? "fill-rose-500 text-rose-500" : ""}`} />
              </button>
              {allowDownloads ? (
                <button
                  type="button"
                  onClick={() => downloadAsset(activeAsset)}
                  aria-label="Download"
                  className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur transition hover:bg-white/20"
                >
                  <Download className="size-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={createFullGalleryShare}
                aria-label="Share"
                className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur transition hover:bg-white/20"
              >
                <Share2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowComments((value) => !value)}
                aria-label="Comments"
                aria-pressed={showComments}
                className={`flex size-10 items-center justify-center rounded-full backdrop-blur transition ${
                  showComments ? "bg-white text-foreground" : "bg-white/10 text-white/90 hover:bg-white/20"
                }`}
              >
                <MessageCircle className="size-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Justified (Flickr/Pic-Time-style) row layout                            */
/* ----------------------------------------------------------------------- */

type JustifiedGridProps = {
  items: PublicAsset[];
  favorites: Set<string>;
  allowDownloads: boolean;
  selectMode: boolean;
  selected: Set<string>;
  commentCounts?: Record<string, number>;
  onSelect: (assetId: string) => void;
  onToggleFavorite: (assetId: string) => void;
  onToggleSelect: (assetId: string) => void;
  onDownload: (asset: PublicAsset) => void;
};

function JustifiedGrid({
  items,
  favorites,
  allowDownloads,
  selectMode,
  selected,
  commentCounts = {},
  onSelect,
  onToggleFavorite,
  onToggleSelect,
  onDownload,
}: JustifiedGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ratios, setRatios] = useState<Record<string, number>>({});

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const gap = 6;
  const targetRowHeight = width > 0 && width < 640 ? 300 : width < 1024 ? 430 : 540;

  const rows = useMemo(() => {
    if (!width) return [] as Array<{ items: Array<{ asset: PublicAsset; w: number; h: number }> }>;

    const defaultRatio = 1.4;
    const result: Array<{ items: Array<{ asset: PublicAsset; w: number; h: number }> }> = [];
    let current: Array<{ asset: PublicAsset; ratio: number }> = [];
    let ratioSum = 0;

    const flush = (stretch: boolean) => {
      if (current.length === 0) return;
      const gaps = gap * (current.length - 1);
      const rowHeight = stretch ? (width - gaps) / ratioSum : targetRowHeight;
      result.push({
        items: current.map(({ asset, ratio }) => ({
          asset,
          w: ratio * rowHeight,
          h: rowHeight,
        })),
      });
      current = [];
      ratioSum = 0;
    };

    items.forEach((asset) => {
      const ratio = ratios[asset.id] || defaultRatio;
      current.push({ asset, ratio });
      ratioSum += ratio;
      const gaps = gap * (current.length - 1);
      if (ratioSum * targetRowHeight + gaps >= width) {
        flush(true);
      }
    });
    flush(false);

    return result;
  }, [items, width, ratios, targetRowHeight]);

  const handleRatio = useCallback((id: string, ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    setRatios((previous) => (previous[id] === ratio ? previous : { ...previous, [id]: ratio }));
  }, []);

  return (
    <div ref={containerRef} className="w-full">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex" style={{ gap, marginBottom: gap }}>
          {row.items.map(({ asset, w, h }) => {
            const isFavorite = favorites.has(asset.id);
            const isSelected = selected.has(asset.id);
            const commentCount = commentCounts[asset.id] || 0;
            return (
              <div
                key={asset.id}
                style={{ width: w, height: h }}
                className="group relative shrink-0 overflow-hidden bg-muted/40"
              >
                <button
                  type="button"
                  onClick={() => (selectMode ? onToggleSelect(asset.id) : onSelect(asset.id))}
                  className="block h-full w-full"
                >
                  {asset.mediaType === "photo" ? (
                    <img
                      src={asset.url}
                      alt={displayName(asset.fileName)}
                      loading="lazy"
                      onLoad={(event) =>
                        handleRatio(
                          asset.id,
                          event.currentTarget.naturalWidth / event.currentTarget.naturalHeight,
                        )
                      }
                      className={`h-full w-full object-cover transition duration-500 group-hover:scale-[1.04] ${
                        selectMode && !isSelected ? "opacity-70" : ""
                      }`}
                    />
                  ) : (
                    <video
                      src={asset.url}
                      preload="metadata"
                      onLoadedMetadata={(event) =>
                        handleRatio(asset.id, event.currentTarget.videoWidth / event.currentTarget.videoHeight)
                      }
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>

                {/* Filename overlay (hover) */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/55 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {asset.fileName ? (
                    <span className="truncate text-[10px] uppercase tracking-[0.18em] text-white/90">
                      {displayName(asset.fileName)}
                    </span>
                  ) : (
                    <span />
                  )}
                  {allowDownloads && !selectMode ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDownload(asset);
                      }}
                      aria-label="Download photo"
                      className="pointer-events-auto flex size-9 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
                    >
                      <Download className="size-4" />
                    </button>
                  ) : null}
                </div>

                {selectMode ? (
                  <span
                    className={`pointer-events-none absolute left-2 top-2 flex size-6 items-center justify-center rounded-full border-2 transition ${
                      isSelected
                        ? "border-white bg-foreground text-background"
                        : "border-white/80 bg-black/30 text-transparent"
                    }`}
                  >
                    <Check className="size-3.5" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(asset.id)}
                    aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                    aria-pressed={isFavorite}
                    className={`absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55 ${
                      isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <Heart className={`size-[18px] ${isFavorite ? "fill-rose-500 text-rose-500" : ""}`} />
                  </button>
                )}

                {!selectMode && commentCount > 0 ? (
                  <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
                    <MessageCircle className="size-3.5" />
                    {commentCount}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}