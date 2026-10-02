"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Loader2, TriangleAlert } from "lucide-react";

import { isVideoFile, UploadAbortedError, uploadMedia, type UploadJob } from "./upload-engine";

type MediaUploaderProps = {
  galleryId: string;
  sections: Array<{ id: string; name: string }>;
  accept?: string;
};

type JobState = {
  file: File;
  loaded: number;
  status: "pending" | "saved" | "failed";
  error?: string;
  name?: string;
  replaceId?: string;
};

type DuplicateChoice = "skip" | "replace" | "keep";

type Duplicate = {
  /** Position in the selection. */
  index: number;
  file: File;
  mediaId: string;
  suggestedName: string;
  choice: DuplicateChoice;
};

type Snapshot = {
  kind: "photo" | "video" | "file";
  total: number;
  saved: number;
  failed: Array<{ id: number; name: string; error: string }>;
  replaced: number;
  /** Duplicates the user chose to skip. */
  skipped: number;
  totalBytes: number;
  sentBytes: number;
  /** Bytes sent since the current run started (excludes earlier runs). */
  runBytes: number;
  bytesPerSecond: number | null;
};

type Phase = "idle" | "checking" | "resolve" | "uploading" | "done" | "cancelled";

const TICK_MS = 300;
const SPEED_WINDOW_MS = 8000;
const REFRESH_EVERY_MS = 20_000;

// Only ever called from event handlers and timers; a named helper keeps the
// React Compiler lint from mistaking the upload handlers for render code.
const clock = () => performance.now();

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(bytes >= 100 * 1024 ** 2 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatEta(seconds: number) {
  if (seconds < 10) return "a few seconds left";
  if (seconds < 60) return `about ${Math.ceil(seconds / 10) * 10}s left`;
  if (seconds < 3600) return `about ${Math.round(seconds / 60)} min left`;
  const hours = Math.floor(seconds / 3600);
  return `about ${hours}h ${Math.round((seconds % 3600) / 60)} min left`;
}

function kindOf(files: File[]): Snapshot["kind"] {
  if (files.length === 0) return "photo";
  const videos = files.filter(isVideoFile).length;
  return videos === files.length ? "video" : videos === 0 ? "photo" : "file";
}

function plural(kind: Snapshot["kind"], count: number) {
  return `${kind}${count === 1 ? "" : "s"}`;
}

export function MediaUploader({ galleryId, sections, accept = "image/*,video/*" }: MediaUploaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);

  // Progress events fire many times a second per file; they land in this ref
  // and the panel re-renders from a snapshot a few times a second instead.
  const jobsRef = useRef(new Map<number, JobState>());
  const samplesRef = useRef<Array<{ t: number; bytes: number }>>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef(0);
  const startBytesRef = useRef(0);
  const skippedRef = useRef(0);
  const lastRefreshRef = useRef(0);

  const selectedBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  const isUploading = phase === "uploading";

  function takeSnapshot(): Snapshot {
    let totalBytes = 0;
    let sentBytes = 0;
    let saved = 0;
    let replaced = 0;
    const failed: Snapshot["failed"] = [];
    const files: File[] = [];
    for (const [id, job] of jobsRef.current) {
      files.push(job.file);
      if (job.status === "failed") {
        failed.push({ id, name: job.file.name, error: job.error || "Upload failed." });
        continue;
      }
      totalBytes += job.file.size;
      sentBytes += job.status === "saved" ? job.file.size : Math.min(job.loaded, job.file.size);
      if (job.status === "saved") saved++;
      if (job.status === "saved" && job.replaceId) replaced++;
    }

    // Speed over a sliding window, so it reacts to network changes without
    // jumping around between ticks.
    const now = clock();
    const samples = samplesRef.current;
    samples.push({ t: now, bytes: sentBytes });
    while (samples.length > 2 && now - samples[0].t > SPEED_WINDOW_MS) samples.shift();
    const first = samples[0];
    const span = now - first.t;
    const bytesPerSecond = span > 1500 ? Math.max(0, ((sentBytes - first.bytes) / span) * 1000) : null;

    return {
      kind: kindOf(files),
      total: jobsRef.current.size,
      saved,
      failed,
      replaced,
      skipped: skippedRef.current,
      totalBytes,
      sentBytes,
      runBytes: sentBytes - startBytesRef.current,
      bytesPerSecond,
    };
  }

  // Keep the screen awake and warn before leaving while bytes are in flight.
  useEffect(() => {
    if (!isUploading) return;

    const tick = () => {
      setSnapshot(takeSnapshot());
      setElapsed((clock() - startedAtRef.current) / 1000);
    };
    const interval = setInterval(tick, TICK_MS);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    let wakeLock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      ?.request("screen")
      .then((lock) => {
        wakeLock = lock;
      })
      .catch(() => null);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      wakeLock?.release().catch(() => null);
    };
  }, [isUploading]);

  async function run(jobs: UploadJob[]) {
    const controller = new AbortController();
    controllerRef.current = controller;
    samplesRef.current = [];
    startedAtRef.current = clock();
    lastRefreshRef.current = clock();
    setElapsed(0);
    // Files saved by an earlier run (before a resume) do not count toward
    // this run's average speed.
    startBytesRef.current = 0;
    for (const job of jobsRef.current.values()) {
      if (job.status === "saved") startBytesRef.current += job.file.size;
    }
    setSnapshot(takeSnapshot());
    setPhase("uploading");

    let cancelled = false;
    try {
      await uploadMedia({
        galleryId,
        sectionId: selectedSectionId || undefined,
        jobs,
        signal: controller.signal,
        callbacks: {
          onBytes: (id, loaded) => {
            const job = jobsRef.current.get(id);
            if (job && job.status === "pending") job.loaded = loaded;
          },
          onSaved: (ids) => {
            for (const id of ids) {
              const job = jobsRef.current.get(id);
              if (job) job.status = "saved";
            }
            // Let new photos show up in the library as the upload goes on.
            if (clock() - lastRefreshRef.current > REFRESH_EVERY_MS) {
              lastRefreshRef.current = clock();
              router.refresh();
            }
          },
          onFailed: (id, message) => {
            const job = jobsRef.current.get(id);
            if (job && job.status !== "saved") {
              job.status = "failed";
              job.error = message;
            }
          },
        },
      });
    } catch (error) {
      cancelled = error instanceof UploadAbortedError;
      if (!cancelled) {
        // Unexpected engine failure: whatever is not saved counts as failed.
        for (const job of jobsRef.current.values()) {
          if (job.status === "pending") {
            job.status = "failed";
            job.error = error instanceof Error ? error.message : "Upload failed.";
          }
        }
      }
    } finally {
      controllerRef.current = null;
    }

    const final = takeSnapshot();
    setSnapshot(final);
    setElapsed((clock() - startedAtRef.current) / 1000);
    setPhase(cancelled ? "cancelled" : "done");
    router.refresh();

    if (!cancelled && final.failed.length === 0) {
      setSelectedFiles([]);
      setSelectedSectionId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Starts the upload with the user's answer for each duplicate (by
  // selection index); files without an entry upload as new.
  const startUpload = (decisions: Map<number, Duplicate>) => {
    const jobs: UploadJob[] = [];
    jobsRef.current = new Map();
    skippedRef.current = 0;
    selectedFiles.forEach((file, id) => {
      const duplicate = decisions.get(id);
      if (duplicate?.choice === "skip") {
        skippedRef.current++;
        return;
      }
      const name = duplicate?.choice === "keep" ? duplicate.suggestedName : undefined;
      const replaceId = duplicate?.choice === "replace" ? duplicate.mediaId : undefined;
      jobsRef.current.set(id, { file, loaded: 0, status: "pending", name, replaceId });
      jobs.push({ id, file, name, replaceId });
    });
    setDuplicates([]);

    if (jobs.length === 0) {
      // Everything was a skipped duplicate.
      setElapsed(0);
      setSnapshot(takeSnapshot());
      setPhase("done");
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    void run(jobs);
  };

  // Photos already in the gallery (same name and size) are found before any
  // byte is sent, and the user decides what happens to them.
  const handleUpload = async () => {
    if (selectedFiles.length === 0 || isUploading || phase === "checking") return;

    const photos = selectedFiles
      .map((file, index) => ({ file, index }))
      .filter(({ file }) => !isVideoFile(file));
    let found: Duplicate[] = [];

    if (photos.length > 0) {
      setPhase("checking");
      try {
        const response = await fetch("/api/admin/galleries/check-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            galleryId,
            files: photos.map(({ file }) => ({ name: file.name, size: file.size })),
          }),
        });
        if (response.ok) {
          const data = (await response.json()) as {
            duplicates: Array<{ index: number; mediaId: string; suggestedName: string }>;
          };
          found = data.duplicates.map((duplicate) => ({
            ...duplicate,
            index: photos[duplicate.index].index,
            file: photos[duplicate.index].file,
            choice: "skip",
          }));
        }
      } catch {
        // The check is a convenience; if it is unavailable, upload as before.
      }
    }

    if (found.length === 0) {
      startUpload(new Map());
      return;
    }
    setDuplicates(found);
    setPhase("resolve");
  };

  const resolveAll = (choice: DuplicateChoice) => {
    startUpload(new Map(duplicates.map((duplicate) => [duplicate.index, { ...duplicate, choice }])));
  };

  const resolveEach = () => {
    startUpload(new Map(duplicates.map((duplicate) => [duplicate.index, duplicate])));
  };

  // Re-sends everything that is not in the gallery yet: failed files after an
  // error, or the remainder after a cancel.
  const handleResume = () => {
    if (isUploading) return;
    const next = new Map<number, JobState>();
    const jobs: UploadJob[] = [];
    for (const [id, job] of jobsRef.current) {
      if (job.status === "saved") {
        next.set(id, job);
        continue;
      }
      next.set(id, { file: job.file, loaded: 0, status: "pending", name: job.name, replaceId: job.replaceId });
      jobs.push({ id, file: job.file, name: job.name, replaceId: job.replaceId });
    }
    jobsRef.current = next;
    if (jobs.length > 0) void run(jobs);
  };

  const handleDismiss = () => {
    jobsRef.current = new Map();
    setSnapshot(null);
    setPhase("idle");
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // A clean finish collapses back to the picker after a moment.
  useEffect(() => {
    if (phase !== "done" || (snapshot?.failed.length ?? 0) > 0) return;
    const timer = setTimeout(handleDismiss, 5000);
    return () => clearTimeout(timer);
  }, [phase, snapshot]);

  if (phase === "checking") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-4 text-sm" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        Checking for photos already in this gallery…
      </div>
    );
  }

  if (phase === "resolve") {
    const total = selectedFiles.length;
    const choiceLabel: Record<DuplicateChoice, string> = {
      skip: "Skip",
      replace: "Replace",
      keep: "Keep both",
    };
    const bulkLabel: Record<DuplicateChoice, string> = {
      skip: `Skip all ${duplicates.length}`,
      replace: `Replace all ${duplicates.length}`,
      keep: `Keep both for all ${duplicates.length}`,
    };
    return (
      <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4" aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <TriangleAlert className="size-4 shrink-0 text-amber-600" />
            <p className="text-sm font-medium">
              {duplicates.length === total
                ? `${duplicates.length === 1 ? "This photo is" : `All ${total} photos are`} already in this gallery`
                : `${duplicates.length} of ${total} ${plural(kindOf(selectedFiles), total)} ${
                    duplicates.length === 1 ? "is" : "are"
                  } already in this gallery`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDuplicates([]);
              setPhase("idle");
            }}
            className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground hover:no-underline"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Same file name and size. <strong className="font-medium text-foreground">Replace</strong>{" "}keeps each
          photo&apos;s place, section, favorites and comments;{" "}
          <strong className="font-medium text-foreground">Keep both</strong>{" "}adds a copy named like
          &ldquo;{duplicates[0]?.suggestedName}&rdquo;.
        </p>

        <div className="flex flex-wrap gap-2">
          {(["skip", "replace", "keep"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => resolveAll(choice)}
              className={`h-9 rounded-xl border px-4 text-xs transition hover:opacity-90 ${
                choice === "skip"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-white text-foreground"
              }`}
            >
              {duplicates.length > 1 ? bulkLabel[choice] : choiceLabel[choice]}
            </button>
          ))}
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Choose for each photo
          </summary>
          <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
            {duplicates.map((duplicate) => (
              <li key={duplicate.index} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{duplicate.file.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatBytes(duplicate.file.size)}
                </span>
                <select
                  value={duplicate.choice}
                  onChange={(event) => {
                    const choice = event.target.value as DuplicateChoice;
                    setDuplicates((previous) =>
                      previous.map((entry) => (entry.index === duplicate.index ? { ...entry, choice } : entry)),
                    );
                  }}
                  className="h-7 shrink-0 rounded-lg border border-border bg-white px-2"
                  aria-label={`What to do with ${duplicate.file.name}`}
                >
                  <option value="skip">Skip</option>
                  <option value="replace">Replace</option>
                  <option value="keep">Keep both as {duplicate.suggestedName}</option>
                </select>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={resolveEach}
            className="mt-3 h-9 rounded-xl border border-foreground bg-foreground px-4 text-xs text-background transition hover:opacity-90"
          >
            Upload with these choices
          </button>
        </details>
      </div>
    );
  }

  if (phase === "idle" || !snapshot) {
    return (
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
          className="h-10 rounded-xl border border-border bg-white px-3 py-2 text-sm"
        />
        <select
          value={selectedSectionId}
          onChange={(e) => setSelectedSectionId(e.target.value)}
          className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
        >
          <option value="">No section</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleUpload}
          disabled={selectedFiles.length === 0}
          className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {selectedFiles.length > 0
            ? `Upload ${selectedFiles.length} ${plural(kindOf(selectedFiles), selectedFiles.length)} · ${formatBytes(selectedBytes)}`
            : "Select files"}
        </button>
      </div>
    );
  }

  const noun = (count: number) => plural(snapshot.kind, count);
  const percent = snapshot.totalBytes > 0 ? (snapshot.sentBytes / snapshot.totalBytes) * 100 : 0;
  const remainingBytes = snapshot.totalBytes - snapshot.sentBytes;
  const allBytesSent = remainingBytes <= 0;
  const pending = snapshot.total - snapshot.saved - snapshot.failed.length;
  const sectionName = sections.find((section) => section.id === selectedSectionId)?.name;
  const averageSpeed = elapsed > 0 ? snapshot.runBytes / elapsed : 0;

  let headline: string;
  let detail: string;
  if (phase === "uploading") {
    headline = allBytesSent
      ? `Saving to gallery… ${snapshot.saved} of ${snapshot.total}`
      : `Uploading ${snapshot.total} ${noun(snapshot.total)}${sectionName ? ` to ${sectionName}` : ""}`;
    const speed = snapshot.bytesPerSecond;
    detail = [
      `${formatBytes(snapshot.sentBytes)} of ${formatBytes(snapshot.totalBytes)}`,
      `${snapshot.saved} saved`,
      speed ? `${formatBytes(speed)}/s` : null,
      speed && speed > 0 && !allBytesSent ? formatEta(remainingBytes / speed) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (phase === "cancelled") {
    headline = `Upload cancelled — ${snapshot.saved} of ${snapshot.total} ${noun(snapshot.total)} saved`;
    detail = pending > 0 ? `${pending} not uploaded yet.` : "";
  } else if (snapshot.total === 0) {
    headline = "Nothing to upload";
    detail = `${snapshot.skipped} ${noun(snapshot.skipped)} skipped — already in the gallery.`;
  } else if (snapshot.failed.length === 0) {
    headline = `${snapshot.saved} ${noun(snapshot.saved)} uploaded`;
    detail = [
      `${formatBytes(snapshot.totalBytes)} in ${formatDuration(elapsed)}`,
      `${formatBytes(averageSpeed)}/s on average`,
      snapshot.replaced > 0 ? `${snapshot.replaced} replaced` : null,
      snapshot.skipped > 0 ? `${snapshot.skipped} skipped` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  } else {
    headline = `${snapshot.saved} of ${snapshot.total} ${noun(snapshot.total)} uploaded, ${snapshot.failed.length} failed`;
    detail = "The rest are already in the gallery.";
  }

  const toResume = snapshot.failed.length + (phase === "cancelled" ? pending : 0);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {phase === "uploading" ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : phase === "done" && snapshot.failed.length === 0 ? (
            <CircleCheck className="size-4 shrink-0 text-emerald-600" />
          ) : (
            <TriangleAlert className="size-4 shrink-0 text-amber-600" />
          )}
          <p className="truncate text-sm font-medium">{headline}</p>
        </div>
        {phase === "uploading" ? (
          <button
            type="button"
            onClick={() => controllerRef.current?.abort()}
            className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground hover:no-underline"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground hover:no-underline"
          >
            {snapshot.failed.length === 0 && phase === "done" ? "Upload more" : "Dismiss"}
          </button>
        )}
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-white">
        <div
          className={`h-full transition-[width] duration-300 ease-out ${
            phase === "done" && snapshot.failed.length === 0
              ? "bg-emerald-500"
              : phase === "uploading"
                ? "bg-foreground"
                : "bg-amber-500"
          } ${phase === "uploading" && allBytesSent ? "animate-pulse" : ""}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>

      {detail && <p className="text-xs tabular-nums text-muted-foreground">{detail}</p>}

      {snapshot.failed.length > 0 && (
        <details className="text-xs" open={phase !== "uploading"}>
          <summary className="cursor-pointer text-red-600">
            {snapshot.failed.length} {noun(snapshot.failed.length)} could not be uploaded
          </summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {snapshot.failed.map((item) => (
              <li key={item.id} className="flex gap-2">
                <span className="max-w-[40%] shrink-0 truncate font-medium">{item.name}</span>
                <span className="text-muted-foreground">{item.error}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {phase !== "uploading" && toResume > 0 && (
        <button
          type="button"
          onClick={handleResume}
          className="h-9 rounded-xl border border-foreground bg-foreground px-4 text-xs text-background transition hover:opacity-90"
        >
          {phase === "cancelled" ? `Resume (${toResume} left)` : `Retry ${toResume} failed`}
        </button>
      )}
    </div>
  );
}
