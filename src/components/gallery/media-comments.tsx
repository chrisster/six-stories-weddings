"use client";

import { useCallback, useEffect, useState } from "react";

type MediaComment = {
  id: string;
  guestName: string | null;
  body: string;
  createdAt: string;
};

type MediaCommentsProps = {
  gallerySlug: string;
  mediaAssetId: string;
  canComment: boolean;
  commenterName?: string | null;
};

export function MediaComments({
  gallerySlug,
  mediaAssetId,
  canComment,
  commenterName = null,
}: MediaCommentsProps) {
  const [comments, setComments] = useState<MediaComment[]>([]);
  const [guestName, setGuestName] = useState(commenterName || "");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (commenterName) setGuestName(commenterName);
  }, [commenterName]);

  const loadComments = useCallback(async () => {
    setLoaded(false);
    try {
      const response = await fetch(
        `/g/${gallerySlug}/comments?asset=${encodeURIComponent(mediaAssetId)}`,
      );
      if (response.ok) {
        const data = (await response.json()) as { comments?: MediaComment[] };
        setComments(data.comments || []);
      }
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }, [gallerySlug, mediaAssetId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const submitComment = async () => {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/g/${gallerySlug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaAssetId,
          guestName: guestName.trim() || undefined,
          body: trimmed,
          timestampSeconds: null,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { comment?: MediaComment };
        if (data.comment) {
          setComments((current) => [...current, data.comment as MediaComment]);
        }
        setBody("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">Comments</p>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {loaded && comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="rounded-xl border border-border/60 bg-zinc-50 px-3 py-2">
              <p className="text-xs font-medium text-foreground">{comment.guestName || "Guest"}</p>
              <p className="mt-1 text-sm text-foreground/90">{comment.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
        {!canComment ? (
          <p className="text-sm text-muted-foreground">
            <a href="/portal/login" className="font-medium text-foreground underline underline-offset-4">
              Sign in
            </a>{" "}
            to leave a comment.
          </p>
        ) : (
          <>
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
  );
}
