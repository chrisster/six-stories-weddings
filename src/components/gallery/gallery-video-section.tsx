/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, MessageCircle, Share2 } from "lucide-react";

export type GalleryVideoAsset = {
  id: string;
  url: string;
  fileName?: string;
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
  canComment?: boolean;
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
  canComment = false,
  commenterName = null,
  sectionRef,
}: GalleryVideoSectionProps) {
  if (videos.length === 0) return null;

  return (
    <section
      data-section="Films"
      ref={sectionRef}
      className="scroll-mt-20 px-2 pb-16 sm:px-4"
    >
      <h2 className="title-cinematic py-10 text-center text-sm uppercase tracking-[0.4em] text-foreground/80 sm:py-14">
        Films
      </h2>
      <div className="mx-auto flex max-w-4xl flex-col gap-16">
        {videos.map((video) => (
          <GalleryVideoItem
            key={video.id}
            video={video}
            gallerySlug={gallerySlug}
            allowDownloads={allowDownloads}
            onDownload={onDownload}
            onShare={onShare}
            canComment={canComment}
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
  canComment,
  commenterName,
}: {
  video: GalleryVideoAsset;
  gallerySlug: string;
  allowDownloads: boolean;
  onDownload: (video: GalleryVideoAsset) => void;
  onShare: (assetId: string) => void;
  canComment: boolean;
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
  }, [gallerySlug, video.id]);

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
    <article className="overflow-hidden rounded-2xl border border-border/70 bg-white">
      <div className="bg-black">
        <video
          ref={videoRef}
          src={video.url}
          controls
          playsInline
          preload="metadata"
          className="mx-auto max-h-[70vh] w-full bg-black"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <p className="text-sm font-medium text-foreground">{displayName(video.fileName) || "Film"}</p>
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
      </div>

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
    </article>
  );
}
