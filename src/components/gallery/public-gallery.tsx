/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Heart, Share2, X } from "lucide-react";

import { formatDateLong } from "@/lib/utils";

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
}: PublicGalleryProps) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
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

  const grouped = useMemo<GroupedSection[]>(() => {
    const map = new Map<string, PublicAsset[]>();
    assets.forEach((asset) => {
      const key = asset.sectionName || "Moments";
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

  const close = useCallback(() => setActiveIndex(null), []);
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

  const share = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: coupleNames, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // ignore cancellations / unsupported
    }
  }, [coupleNames]);

  const activeAsset = activeIndex !== null ? flatOrdered[activeIndex] : null;
  const dateLong = formatDateLong(eventDate);
  const favoriteCount = favorites.size;

  return (
    <div className="bg-white text-foreground">
      {/* ---------- HERO ---------- */}
      <header className="flex min-h-screen flex-col justify-center px-4 py-12 sm:py-16">
        <p className="title-cinematic text-center text-sm uppercase tracking-[0.42em] text-foreground/80 sm:text-base">
          {studioName}
        </p>

        <div className="mt-12 flex flex-1 flex-col items-center justify-center gap-6 md:mt-0 md:flex-row md:gap-10">
          <p className="hidden self-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground md:block md:[writing-mode:vertical-rl] md:rotate-180">
            Photographed by {studioName} Studio
          </p>

          <div className="relative aspect-[3/4] w-[260px] max-w-[72vw] overflow-hidden bg-muted/40 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.5)] sm:w-[300px]">
            {coverUrl ? (
              <img src={coverUrl} alt={coupleNames} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-[linear-gradient(135deg,#1c1c1c,#3a3a3a)]" />
            )}
          </div>

          <div className="text-center md:min-w-[160px] md:text-left">
            <h1 className="title-cinematic text-2xl font-medium tracking-wide sm:text-3xl">{coupleNames}</h1>
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
          <span className="title-cinematic shrink-0 text-xs uppercase tracking-[0.28em] text-foreground/80">
            {studioName}
          </span>

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

          <button
            type="button"
            onClick={share}
            aria-label="Share gallery"
            className="shrink-0 rounded-full p-2 text-muted-foreground transition hover:text-foreground"
          >
            <Share2 className="size-4" />
          </button>
        </div>
      </nav>

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
          displayedGroups.map((group, index) => (
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
                items={group.items}
                favorites={favorites}
                onSelect={openAt}
                onToggleFavorite={toggleFavorite}
              />
            </section>
          ))
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
            className="flex max-h-[92vh] w-full max-w-6xl items-center justify-center px-4 pb-20"
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
                <a
                  href={activeAsset.url}
                  download
                  aria-label="Download"
                  className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur transition hover:bg-white/20"
                >
                  <Download className="size-4" />
                </a>
              ) : null}
              <button
                type="button"
                onClick={share}
                aria-label="Share"
                className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur transition hover:bg-white/20"
              >
                <Share2 className="size-4" />
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
  onSelect: (assetId: string) => void;
  onToggleFavorite: (assetId: string) => void;
};

function JustifiedGrid({ items, favorites, onSelect, onToggleFavorite }: JustifiedGridProps) {
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
  const targetRowHeight = width > 0 && width < 640 ? 170 : width < 1024 ? 240 : 300;

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
            return (
              <div
                key={asset.id}
                style={{ width: w, height: h }}
                className="group relative shrink-0 overflow-hidden bg-muted/40"
              >
                <button
                  type="button"
                  onClick={() => onSelect(asset.id)}
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
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
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
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end bg-gradient-to-t from-black/55 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {asset.fileName ? (
                    <span className="truncate text-[10px] uppercase tracking-[0.18em] text-white/90">
                      {displayName(asset.fileName)}
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => onToggleFavorite(asset.id)}
                  aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                  aria-pressed={isFavorite}
                  className={`absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55 ${
                    isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <Heart className={`size-4 ${isFavorite ? "fill-rose-500 text-rose-500" : ""}`} />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}