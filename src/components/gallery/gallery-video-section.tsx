/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, EyeOff, MessageCircle, Share2 } from "lucide-react";

export type GalleryVideoAsset = {
  id: string;
  url: string;
  fileName?: string;
  posterUrl?: string | null;
};

type VideoComment = {
  id: string;
  guestName: string | null;
  body: string;
  timestampSeconds: number | null;
  createdAt: string;
};

type GalleryVideoSectionProps = {
  videos: GalleryVideoAsset[];
  gallerySlug: string;
  allowDownloads: boolean;
  onDownload: (video: GalleryVideoAsset) => void;
  onShare: (assetId: string) => void;
  /** Share/download selection mode, shared with the photo grid. */
  selectMode?: boolean;
  selected?: Set<string>;
  /** Hidden from shared-link guests (shown to the couple as a badge). */
  hiddenIds?: Set<string>;
  onToggleSelect?: (assetId: string) => void;
  onToggleSelectAll?: () => void;
  canComment?: boolean;
  /** Gallery-level toggle: when false, the comments block is hidden entirely. */
  commentsEnabled?: boolean;
  commenterName?: string | null;
  sectionRef?: (element: HTMLElement | null) => void;
};

function formatTimestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function displayName(name?: string) {
  if (!name) return "";
  return name.replace(/\.[^./]+$/, "");
}

export function GalleryVideoSection({
  videos,
  gallerySlug,
  allowDownloads,
  onDownload,
  onShare,
  selectMode = false,
  selected,
  hiddenIds,
  onToggleSelect,
  onToggleSelectAll,
  canComment = false,
  commentsEnabled = true,
  commenterName = null,
  sectionRef,
}: GalleryVideoSectionProps) {
  if (videos.length === 0) return null;
  const selectedCount = videos.filter((video) => selected?.has(video.id)).length;
  const allSelected = selectedCount === videos.length;

  return (
    <section
      data-section="Film"
      ref={sectionRef}
      className="scroll-mt-20 px-2 pb-16 sm:px-4"
    >
      <h2 className="title-cinematic py-10 text-center text-sm uppercase tracking-[0.4em] text-foreground/80 sm:py-14">
        Film
      </h2>
      {selectMode && onToggleSelectAll ? (
        <div className="-mt-6 mb-6 flex justify-center sm:-mt-8">
          <button
            type="button"
            onClick={onToggleSelectAll}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] transition ${
              allSelected
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/30 text-foreground hover:border-foreground"
            }`}
          >
            <Check className="size-3.5" />
            {allSelected ? `Deselect all (${videos.length})` : `Select all (${videos.length})`}
            {selectedCount > 0 && !allSelected ? (
              <span className="text-muted-foreground">· {selectedCount} selected</span>
            ) : null}
          </button>
        </div>
      ) : null}
      <div className="mx-auto flex max-w-4xl flex-col gap-16">
        {videos.map((video) => (
          <GalleryVideoItem
            key={video.id}
            video={video}
            gallerySlug={gallerySlug}
            allowDownloads={allowDownloads}
            onDownload={onDownload}
            onShare={onShare}
            selectMode={selectMode}
            isSelected={Boolean(selected?.has(video.id))}
            isHidden={Boolean(hiddenIds?.has(video.id))}
            onToggleSelect={onToggleSelect}
            canComment={canComment}
            commentsEnabled={commentsEnabled}
            commenterName={commenterName}
          />
        ))}
      </div>
    </section>
  );
}

function GalleryVideoItem({
  video,
  gallerySlug,
  allowDownloads,
  onDownload,
  onShare,
  selectMode,
  isSelected,
  isHidden,
  onToggleSelect,
  canComment,
  commentsEnabled,
  commenterName,
}: {
  video: GalleryVideoAsset;
  gallerySlug: string;
  allowDownloads: boolean;
  onDownload: (video: GalleryVideoAsset) => void;
  onShare: (assetId: string) => void;
  selectMode: boolean;
  isSelected: boolean;
  isHidden: boolean;
  onToggleSelect?: (assetId: string) => void;
  canComment: boolean;
  commentsEnabled: boolean;
  commenterName: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [guestName, setGuestName] = useState(commenterName || "");
  const [body, setBody] = useState("");
  const [pendingTs, setPendingTs] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (commenterName) {
      setGuestName(commenterName);
      return;
    }
    try {
      const savedName = localStorage.getItem("ss_guest_name") || "";
      if (savedName) setGuestName(savedName);
    } catch {
      // ignore
    }
  }, [commenterName]);

  const loadComments = useCallback(async () => {
    if (!commentsEnabled) {
      setLoaded(true);
      return;
    }
    try {
      const response = await fetch(
        `/g/${gallerySlug}/comments?asset=${encodeURIComponent(video.id)}`,
      );
      if (!response.ok) return;
      const data = (await response.json()) as { comments?: VideoComment[] };
      setComments(data.comments || []);
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }, [gallerySlug, video.id, commentsEnabled]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const captureCurrentTime = () => {
    const current = videoRef.current?.currentTime ?? 0;
    setPendingTs(Math.max(0, Math.floor(current)));
  };

  const seekTo = (seconds: number) => {
    const element = videoRef.current;
    if (!element) return;
    element.currentTime = seconds;
    void element.play().catch(() => {});
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const submitComment = async () => {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/g/${gallerySlug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaAssetId: video.id,
          guestName: guestName.trim() || undefined,
          body: trimmed,
          timestampSeconds: pendingTs,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { comment?: VideoComment };
        if (data.comment) {
          setComments((current) => {
            const next = [...current, data.comment as VideoComment];
            next.sort((a, b) => {
              const at = a.timestampSeconds ?? -1;
              const bt = b.timestampSeconds ?? -1;
              if (at !== bt) return at - bt;
              return a.createdAt.localeCompare(b.createdAt);
            });
            return next;
          });
        }
        try {
          if (guestName.trim()) localStorage.setItem("ss_guest_name", guestName.trim());
        } catch {
          // ignore
        }
        setBody("");
        setPendingTs(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white transition ${
        selectMode && isSelected ? "border-foreground ring-2 ring-foreground" : "border-border/70"
      }`}
    >
      <div className="flex justify-center bg-black">
        <video
          ref={videoRef}
          src={video.url}
          poster={video.posterUrl || undefined}
          controls
          playsInline
          preload="metadata"
          className="max-h-[65vh] w-auto max-w-full object-contain bg-black"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          {displayName(video.fileName) || "Film"}
          {isHidden ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-background">
              <EyeOff className="size-3" />
              Hidden from guests
            </span>
          ) : null}
        </p>
        {selectMode && onToggleSelect ? (
          <button
            type="button"
            onClick={() => onToggleSelect(video.id)}
            aria-pressed={isSelected}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
              isSelected
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:border-foreground/30"
            }`}
          >
            <Check className="size-3.5" />
            {isSelected ? "Selected" : "Select"}
          </button>
        ) : (
        <div className="flex items-center gap-2">
          {allowDownloads ? (
            <button
              type="button"
              onClick={() => onDownload(video)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs transition hover:border-foreground/30"
            >
              <Download className="size-3.5" />
              Download
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onShare(video.id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs transition hover:border-foreground/30"
          >
            <Share2 className="size-3.5" />
            Share
          </button>
        </div>
        )}
      </div>

      {commentsEnabled ? (
      <div className="px-4 py-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <MessageCircle className="size-4" />
          Comments
        </div>

        {loaded && comments.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">
            No comments yet. Add a note at a specific moment in the film.
          </p>
        ) : (
          <ul className="mb-4 space-y-2">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-xl border border-border/60 bg-zinc-50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {comment.timestampSeconds != null ? (
                    <button
                      type="button"
                      onClick={() => seekTo(comment.timestampSeconds as number)}
                      className="inline-flex shrink-0 items-center rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background transition hover:opacity-90"
                    >
                      {formatTimestamp(comment.timestampSeconds)}
                    </button>
                  ) : null}
                  <span className="text-xs font-medium text-foreground">
                    {comment.guestName || "Guest"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground/90">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 rounded-xl border border-border/70 bg-white p-3">
          {!canComment ? (
            <p className="text-sm text-muted-foreground">
              <a
                href="/portal/login"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Sign in
              </a>{" "}
              to leave a comment on this film.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={captureCurrentTime}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs transition hover:border-foreground/30"
                >
                  {pendingTs != null ? `At ${formatTimestamp(pendingTs)}` : "Comment at current time"}
                </button>
                {pendingTs != null ? (
                  <button
                    type="button"
                    onClick={() => setPendingTs(null)}
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Clear time
                  </button>
                ) : null}
              </div>

              <input
                type="text"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                placeholder="Your name (optional)"
                className="h-10 w-full rounded-xl border border-border px-3 text-sm"
              />

              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={2}
                placeholder="Leave a comment…"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={submitting || body.trim().length === 0}
                  className="h-9 rounded-full border border-foreground bg-foreground px-4 text-sm text-background transition hover:opacity-90 disabled:opacity-40"
                >
                  {submitting ? "Posting…" : "Post comment"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      ) : null}
    </article>
  );
}
