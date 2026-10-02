// Parallel upload engine behind <MediaUploader>. Bytes go straight from the
// browser to storage over presigned URLs; the app's functions only sign and
// record. What makes it fast:
//
// - Photos upload six at a time instead of one after another.
// - Upload targets are signed in batches (one function call per ~24 photos,
//   fetched ahead of need) instead of one call per photo.
// - Previews are generated in Web Workers while the original is uploading.
// - Uploaded files are recorded in batches (up to 24 at once, or whatever
//   finished within two seconds) off the upload's critical path. Batches are
//   released in selection order, so the gallery keeps the photographer's
//   sequence even though files finish out of order.
// - Videos upload as 32MB+ multipart chunks, four in flight, with all part URLs
//   signed in runs of 20.
// - Every PUT retries with backoff, so one dropped connection does not fail a
//   2GB film.

import { createPreviewPool, type PhotoPreviews } from "./upload-previews";

export type UploadJob = { id: number; file: File };

export type UploadCallbacks = {
  /** Bytes of this job's file sent so far (absolute, may go back on retry). */
  onBytes: (jobId: number, loaded: number) => void;
  /** These jobs are uploaded and recorded in the gallery. */
  onSaved: (jobIds: number[]) => void;
  onFailed: (jobId: number, message: string) => void;
};

type UploadOptions = {
  galleryId: string;
  sectionId?: string;
  jobs: UploadJob[];
  signal: AbortSignal;
  callbacks: UploadCallbacks;
};

type SignedTarget =
  | { provider: "r2"; url: string; path: string }
  | { provider: "supabase"; bucket: string; path: string; token: string };

type PhotoTarget = {
  storagePath: string;
  target: SignedTarget;
  thumbTarget: SignedTarget | null;
  smallThumbTarget: SignedTarget | null;
};

type RegisterItem = {
  storagePath: string;
  originalName: string;
  contentType: string;
  width?: number;
  height?: number;
};

const PHOTO_CONCURRENCY = 6;
const SIGN_BATCH = 24;
const VIDEO_PART_CONCURRENCY = 4;
const VIDEO_SIGN_BATCH = 20;
const MIN_PART_SIZE = 32 * 1024 * 1024;
const MAX_PARTS = 10_000;
const REGISTER_BATCH = 100;
const REGISTER_GATHER = 24;
const REGISTER_WAIT_MS = 2000;

export class UploadAbortedError extends Error {
  constructor() {
    super("Upload cancelled.");
  }
}

export function isVideoFile(file: File) {
  return (file.type || "").startsWith("video/");
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new UploadAbortedError());
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new UploadAbortedError());
      },
      { once: true },
    );
  });
}

/** Retries transient failures (network drops, 5xx, 429) with backoff. */
async function withRetry<T>(
  task: (attempt: number) => Promise<T>,
  signal: AbortSignal,
  attempts = 4,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal.aborted) throw new UploadAbortedError();
    try {
      return await task(attempt);
    } catch (error) {
      if (error instanceof UploadAbortedError || (error as { fatal?: boolean }).fatal) throw error;
      lastError = error;
      if (attempt < attempts - 1) await wait(800 * 2 ** attempt, signal);
    }
  }
  throw lastError;
}

async function postJson<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new UploadAbortedError();
    throw error;
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status}).`) as Error & {
      status: number;
      fatal: boolean;
    };
    error.status = response.status;
    // 4xx (other than rate limiting) will not get better on retry.
    error.fatal = response.status >= 400 && response.status < 500 && response.status !== 429;
    throw error;
  }
  return data as T;
}

/**
 * PUTs a blob to a presigned URL and resolves with the response ETag. The
 * Content-Type header, when given, must match the one the URL was signed with.
 */
function putBlob(
  url: string,
  body: Blob,
  contentType: string | null,
  signal: AbortSignal,
  onProgress?: (loaded: number) => void,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new UploadAbortedError());
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    const done = () => signal.removeEventListener("abort", onAbort);

    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader("ETag"));
        return;
      }
      const error = new Error(`Upload failed (${xhr.status}).`) as Error & { fatal: boolean };
      // An expired or rejected signature is fatal for this URL.
      error.fatal = xhr.status === 403;
      reject(error);
    };
    xhr.onerror = () => {
      done();
      reject(new Error("Network error while uploading."));
    };
    xhr.onabort = () => {
      done();
      reject(new UploadAbortedError());
    };
    xhr.send(body);
  });
}

async function putToTarget(
  target: SignedTarget,
  body: Blob,
  contentType: string,
  signal: AbortSignal,
  onProgress?: (loaded: number) => void,
) {
  if (target.provider === "r2") {
    await putBlob(target.url, body, contentType, signal, onProgress);
    return;
  }
  // Supabase Storage reports no upload progress; count the bytes on completion.
  const { createClient } = await import("@/lib/supabase/client");
  const { error } = await createClient()
    .storage.from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, body, { contentType });
  if (error) throw new Error(error.message);
  onProgress?.(body.size);
}

/**
 * Runs `worker` over `items` with at most `concurrency` in flight. After the
 * first failure no new items start; it rethrows once the running ones settle.
 */
async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  let failure = null as { error: unknown } | null;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (!failure && next < items.length) {
        const index = next++;
        try {
          await worker(items[index], index);
        } catch (error) {
          failure ??= { error };
        }
      }
    }),
  );
  if (failure) throw failure.error;
}

/**
 * Lazily fetches values in fixed-size batches, memoized per batch, and starts
 * the next batch once the current one is half used so workers rarely wait.
 */
function createBatchedLoader<T>(batchSize: number, total: number, load: (from: number, to: number) => Promise<T[]>) {
  const batches = new Map<number, Promise<T[]>>();
  const batch = (index: number) => {
    let promise = batches.get(index);
    if (!promise) {
      promise = load(index * batchSize, Math.min(total, (index + 1) * batchSize));
      // A failed batch is retried by the next caller rather than cached.
      promise.catch(() => batches.delete(index));
      batches.set(index, promise);
    }
    return promise;
  };
  return async (position: number): Promise<T> => {
    const index = Math.floor(position / batchSize);
    if (position % batchSize >= batchSize / 2 && (index + 1) * batchSize < total) {
      batch(index + 1).catch(() => null);
    }
    return (await batch(index))[position % batchSize];
  };
}

/**
 * Records uploaded files in selection order. Only the settled prefix of the
 * job list is sent, one request at a time; a short wait lets finished files
 * gather so a large upload costs a handful of register calls, not one per
 * photo.
 */
function createOrderedRegistrar(
  galleryId: string,
  sectionId: string | undefined,
  order: number[],
  callbacks: UploadCallbacks,
) {
  // Files handed to the registrar are already in storage, so recording them
  // is not cancelled with the upload.
  const signal = new AbortController().signal;
  const settled = new Map<number, RegisterItem | null>();
  let cursor = 0;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let draining = false;

  const pump = (force = false) => {
    if (inFlight) return;
    if (!force && !draining) {
      let ready = 0;
      for (let i = cursor; i < order.length && settled.has(order[i]) && ready < REGISTER_GATHER; i++) {
        if (settled.get(order[i])) ready++;
      }
      if (ready === 0) return;
      if (ready < REGISTER_GATHER) {
        timer ??= setTimeout(() => {
          timer = null;
          pump(true);
        }, REGISTER_WAIT_MS);
        return;
      }
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const batch: Array<{ id: number; item: RegisterItem }> = [];
    while (cursor < order.length && settled.has(order[cursor]) && batch.length < REGISTER_BATCH) {
      const id = order[cursor++];
      const item = settled.get(id);
      if (item) batch.push({ id, item });
    }
    if (batch.length === 0) return;

    inFlight = withRetry(
      () =>
        postJson(
          "/api/admin/galleries/register-media",
          { galleryId, sectionId, items: batch.map(({ item }) => item) },
          signal,
        ),
      signal,
    )
      .then(
        () => callbacks.onSaved(batch.map(({ id }) => id)),
        (error) => {
          const message = `Uploaded, but could not be saved to the gallery: ${
            error instanceof Error ? error.message : "unknown error"
          }`;
          for (const { id } of batch) callbacks.onFailed(id, message);
        },
      )
      .finally(() => {
        inFlight = null;
        pump();
      });
  };

  return {
    ready(id: number, item: RegisterItem) {
      settled.set(id, item);
      pump();
    },
    skip(id: number) {
      settled.set(id, null);
      pump();
    },
    async drain() {
      draining = true;
      pump();
      while (inFlight) await inFlight;
    },
  };
}

// Legacy fallback: streams the file through /api/admin/galleries/upload, which
// records it itself. Only used when no signed upload target can be issued.
async function uploadPhotoProxied(
  galleryId: string,
  sectionId: string | undefined,
  file: File,
  signal: AbortSignal,
  onProgress: (loaded: number) => void,
) {
  // Vercel serverless request bodies fail on larger payloads, so large images
  // are recompressed for this path only.
  let toSend = file;
  if (file.type.startsWith("image/") && file.size > 4 * 1024 * 1024) {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, 2800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (blob) toSend = new File([blob], `${file.name.replace(/\.[^/.]+$/, "")}.jpg`, { type: "image/jpeg" });
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.open("POST", "/api/admin/galleries/upload");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * file.size));
    };
    xhr.onload = () => {
      signal.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status}).`;
      try {
        message = (JSON.parse(xhr.responseText) as { error?: string }).error || message;
      } catch {
        if (xhr.status === 413) message = "File is too large for this upload path.";
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.onabort = () => reject(new UploadAbortedError());
    const form = new FormData();
    form.append("galleryId", galleryId);
    form.append("file", toSend);
    if (sectionId) form.append("sectionId", sectionId);
    xhr.send(form);
  });
}

async function uploadPhotos(options: UploadOptions, photos: UploadJob[]) {
  const { galleryId, sectionId, signal, callbacks } = options;
  const contentTypeOf = (file: File) => file.type || "image/jpeg";

  const registrar = createOrderedRegistrar(
    galleryId,
    sectionId,
    photos.map((job) => job.id),
    callbacks,
  );
  const previews = createPreviewPool();
  const getTarget = createBatchedLoader<PhotoTarget>(SIGN_BATCH, photos.length, (from, to) =>
    withRetry(
      () =>
        postJson<{ items: PhotoTarget[] }>(
          "/api/admin/galleries/upload-url",
          {
            galleryId,
            files: photos.slice(from, to).map(({ file }) => ({
              fileName: file.name,
              contentType: contentTypeOf(file),
              withThumb: true,
            })),
          },
          signal,
        ).then((data) => data.items),
      signal,
    ),
  );

  try {
    await runPool(photos, PHOTO_CONCURRENCY, async (job, position) => {
      const { file } = job;
      const contentType = contentTypeOf(file);
      const onProgress = (loaded: number) => callbacks.onBytes(job.id, loaded);

      try {
        let signed: PhotoTarget;
        try {
          signed = await getTarget(position);
        } catch (error) {
          if (error instanceof UploadAbortedError) throw error;
          // Signed flow unavailable — fall back to the proxied upload, which
          // records the photo itself.
          await uploadPhotoProxied(galleryId, sectionId, file, signal, onProgress);
          registrar.skip(job.id);
          callbacks.onSaved([job.id]);
          return;
        }

        // Previews render in a worker while the original is on the wire.
        const previewsReady: Promise<PhotoPreviews> = previews.make(file);

        await withRetry(() => {
          onProgress(0);
          return putToTarget(signed.target, file, contentType, signal, onProgress);
        }, signal);
        onProgress(file.size);

        // The previews are best-effort: a missing thumbs/ object just means
        // grids fall back to the on-demand resize route for this photo.
        const preview = await previewsReady;
        const putPreview = async (target: SignedTarget | null, blob: Blob | null) => {
          if (!target || !blob) return;
          await withRetry(() => putToTarget(target, blob, "image/webp", signal), signal, 2).catch((error) => {
            if (error instanceof UploadAbortedError) throw error;
          });
        };
        await Promise.all([
          putPreview(signed.thumbTarget, preview.large),
          putPreview(signed.smallThumbTarget, preview.small),
        ]);

        registrar.ready(job.id, {
          storagePath: signed.storagePath,
          originalName: file.name,
          contentType,
          width: preview.width ?? undefined,
          height: preview.height ?? undefined,
        });
      } catch (error) {
        registrar.skip(job.id);
        if (error instanceof UploadAbortedError) throw error;
        callbacks.onFailed(job.id, error instanceof Error ? error.message : "Upload failed.");
      }
    });
  } finally {
    previews.dispose();
    await registrar.drain();
  }
}

async function uploadVideo(options: UploadOptions, job: UploadJob) {
  const { galleryId, sectionId, signal, callbacks } = options;
  const { file } = job;
  const contentType = file.type || "video/mp4";
  const reportTotal = (() => {
    const loadedByPart = new Map<number, number>();
    return (part: number, loaded: number) => {
      loadedByPart.set(part, loaded);
      let sum = 0;
      for (const value of loadedByPart.values()) sum += value;
      callbacks.onBytes(job.id, sum);
    };
  })();

  // Multipart on R2: a single presigned PUT is capped at 5 GiB and its URL
  // would expire before a multi-GB transfer finishes. A 409 means R2 is not the
  // active provider, so fall back to one signed URL.
  let multipart: { storagePath: string; uploadId: string } | null = null;
  try {
    multipart = await withRetry(
      () =>
        postJson<{ storagePath: string; uploadId: string }>(
          "/api/admin/galleries/video-multipart",
          { action: "create", galleryId, fileName: file.name, contentType },
          signal,
        ),
      signal,
    );
  } catch (error) {
    if ((error as { status?: number }).status !== 409) throw error;
  }

  let storagePath: string;
  if (multipart) {
    storagePath = multipart.storagePath;
    const { uploadId } = multipart;
    // R2 requires every part except the last to be the same size.
    const partSize = Math.max(MIN_PART_SIZE, Math.ceil(file.size / MAX_PARTS / (1024 * 1024)) * 1024 * 1024);
    const partNumbers = Array.from({ length: Math.max(1, Math.ceil(file.size / partSize)) }, (_, i) => i + 1);
    const getPartUrl = createBatchedLoader<string>(VIDEO_SIGN_BATCH, partNumbers.length, (from, to) =>
      withRetry(
        () =>
          postJson<{ urls: Record<string, string> }>(
            "/api/admin/galleries/video-multipart",
            { action: "sign-parts", storagePath, uploadId, partNumbers: partNumbers.slice(from, to) },
            signal,
          ).then((data) => partNumbers.slice(from, to).map((n) => data.urls[n])),
        signal,
      ),
    );

    const parts: Array<{ partNumber: number; etag: string }> = [];
    try {
      await runPool(partNumbers, VIDEO_PART_CONCURRENCY, async (partNumber, index) => {
        const start = index * partSize;
        const chunk = file.slice(start, Math.min(start + partSize, file.size));
        const url = await getPartUrl(index);
        const etag = await withRetry(async () => {
          reportTotal(partNumber, 0);
          return putBlob(url, chunk, null, signal, (loaded) => reportTotal(partNumber, loaded));
        }, signal);
        if (!etag) {
          // The bytes uploaded fine, but the browser can't read the ETag the
          // storage returned, so the upload can't be finalized. This is almost
          // always a missing `ExposeHeaders: ["ETag"]` entry in the R2 bucket
          // CORS policy.
          throw Object.assign(
            new Error(
              "Video uploaded but could not be finalized: the storage ETag header was blocked by CORS. " +
                'Add ExposeHeaders: ["ETag"] to the R2 bucket CORS policy for this domain, then re-upload.',
            ),
            { fatal: true },
          );
        }
        reportTotal(partNumber, chunk.size);
        parts.push({ partNumber, etag });
      });

      await withRetry(
        () =>
          postJson("/api/admin/galleries/video-multipart", { action: "complete", storagePath, uploadId, parts }, signal),
        signal,
      );
    } catch (error) {
      // Discard any uploaded parts so they do not linger and incur storage cost.
      void fetch("/api/admin/galleries/video-multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "abort", storagePath, uploadId }),
        keepalive: true,
      }).catch(() => null);
      throw error;
    }
  } else {
    const data = await withRetry(
      () =>
        postJson<{ storagePath: string; target: SignedTarget }>(
          "/api/admin/galleries/upload-url",
          { galleryId, fileName: file.name, contentType },
          signal,
        ),
      signal,
    );
    storagePath = data.storagePath;
    await withRetry(
      () => putToTarget(data.target, file, contentType, signal, (loaded) => reportTotal(1, loaded)),
      signal,
    );
  }

  await withRetry(
    () =>
      postJson(
        "/api/admin/galleries/register-media",
        { galleryId, sectionId, items: [{ storagePath, originalName: file.name, contentType }] },
        signal,
      ),
    signal,
  );
  callbacks.onBytes(job.id, file.size);
  callbacks.onSaved([job.id]);
}

/**
 * Uploads every job, reporting through `callbacks`. Resolves when all jobs
 * are saved or failed; rejects with UploadAbortedError when cancelled.
 */
export async function uploadMedia(options: UploadOptions): Promise<void> {
  const photos = options.jobs.filter((job) => !isVideoFile(job.file));
  const videos = options.jobs.filter((job) => isVideoFile(job.file));

  if (photos.length > 0) await uploadPhotos(options, photos);

  // Each film already keeps several parts in flight, so films go one by one.
  for (const job of videos) {
    try {
      await uploadVideo(options, job);
    } catch (error) {
      if (error instanceof UploadAbortedError) throw error;
      options.callbacks.onFailed(job.id, error instanceof Error ? error.message : "Video upload failed.");
    }
  }

  if (options.signal.aborted) throw new UploadAbortedError();
}
