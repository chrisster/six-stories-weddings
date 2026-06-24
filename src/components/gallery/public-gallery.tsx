/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Share2, X } from "lucide-react";

import { formatDateLong } from "@/lib/utils";

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

export function PublicGallery({
  assets,
  allowDownloads,
  coupleNames,
  eventDate,
  coverUrl,
  studioName = "Six Stories",
  sectionOrder = [],
}: PublicGalleryProps) {
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

  const flatOrdered = useMemo(() => grouped.flatMap((group) => group.items), [grouped]);

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
  }, [grouped]);

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

  return (
    <div className="bg-white text-foreground">
      {/* ---------- HERO ---------- */}
      <header className="px-4 pt-10 pb-6 sm:pt-14">
        <p className="title-cinematic text-center text-sm uppercase tracking-[0.42em] text-foreground/80 sm:text-base">
          {studioName}
        </p>

        <div className="mt-10 flex flex-col items-center gap-6 md:mt-14 md:flex-row md:items-center md:justify-center md:gap-10">
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
              onClick={scrollToGallery}
              className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground transition hover:text-foreground"
            >
              Gallery
            </button>
            {grouped.map((group) => (
              <button
                key={group.name}
                type="button"
                onClick={() => scrollToSection(group.name)}
                className={`text-[11px] uppercase tracking-[0.22em] transition hover:text-foreground ${
                  activeSection === group.name ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {group.name}
              </button>
            ))}
          </div>

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
        {grouped.map((group, index) => (
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
            <JustifiedGrid items={group.items} onSelect={openAt} />
          </section>
        ))}
      </div>

      {/* ---------- LIGHTBOX ---------- */}
      {activeAsset ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
          onClick={close}
        >
          <button
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
            className="flex max-h-[92vh] w-full max-w-6xl items-center justify-center px-4"
            onClick={(event) => event.stopPropagation()}
          >
            {activeAsset.mediaType === "photo" ? (
              <img
                src={activeAsset.url}
                alt="Selected media"
                className="max-h-[92vh] w-auto max-w-full object-contain"
              />
            ) : (
              <video src={activeAsset.url} controls autoPlay className="max-h-[92vh] w-auto max-w-full" />
            )}
          </div>

          {allowDownloads ? (
            <a
              href={activeAsset.url}
              download
              onClick={(event) => event.stopPropagation()}
              className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/90 backdrop-blur transition hover:bg-white/20"
            >
              <Download className="size-4" /> Download
            </a>
          ) : null}
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
  onSelect: (assetId: string) => void;
};

function JustifiedGrid({ items, onSelect }: JustifiedGridProps) {
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
          {row.items.map(({ asset, w, h }) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => onSelect(asset.id)}
              style={{ width: w, height: h }}
              className="group relative shrink-0 overflow-hidden bg-muted/40"
            >
              {asset.mediaType === "photo" ? (
                <img
                  src={asset.url}
                  alt=""
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
          ))}
        </div>
      ))}
    </div>
  );
}