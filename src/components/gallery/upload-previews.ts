// Downscaled webp previews generated in the browser at upload time and stored
// next to the original: thumbs/<path>.webp at 1600px (lightbox, large grid
// rows) and thumbs/sm/<path>.webp at 480px (cards, phones). Grids then load
// these directly from the storage CDN — no server-side sharp, no function
// transfer. Also yields the photo's oriented pixel dimensions even when webp
// encoding fails; the previews themselves are optional (the on-demand sharp
// route remains the fallback for formats the browser cannot decode, e.g.
// HEIC outside Safari).
//
// Decoding a 24MP original takes a few hundred milliseconds, so the work runs
// in a small pool of Web Workers (OffscreenCanvas) while the original is
// already uploading — the page stays responsive and previews are never on the
// upload's critical path. Browsers without OffscreenCanvas fall back to the
// main thread, one photo at a time to bound memory.

export type PhotoPreviews = {
  large: Blob | null;
  small: Blob | null;
  width: number | null;
  height: number | null;
};

const EMPTY: PhotoPreviews = { large: null, small: null, width: null, height: null };

// Kept as plain JS so it can be started from a Blob URL without any bundler
// worker support. The 480px preview is drawn from the 1600px one: cheaper than
// a second pass over the full-size bitmap.
const WORKER_SOURCE = `
function scale(source, maxWidth) {
  const ratio = Math.min(1, maxWidth / source.width);
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(source.width * ratio)),
    Math.max(1, Math.round(source.height * ratio)),
  );
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function encode(canvas, quality) {
  try {
    const blob = await canvas.convertToBlob({ type: "image/webp", quality });
    // Some browsers silently fall back to PNG when webp encoding is
    // unsupported; the stored key promises webp, so skip the upload then.
    return blob.type === "image/webp" ? blob : null;
  } catch {
    return null;
  }
}
self.onmessage = async (event) => {
  const { id, file } = event.data;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const width = bitmap.width;
    const height = bitmap.height;
    const largeCanvas = scale(bitmap, 1600);
    bitmap.close();
    const large = await encode(largeCanvas, 0.75);
    const small = await encode(scale(largeCanvas, 480), 0.7);
    self.postMessage({ id, large, small, width, height });
  } catch {
    self.postMessage({ id, large: null, small: null, width: null, height: null });
  }
};
`;

type Pending = { resolve: (value: PhotoPreviews) => void; file: File };

function supportsWorkerPreviews(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof OffscreenCanvas.prototype.convertToBlob === "function"
  );
}

async function makePreviewsOnMainThread(file: File): Promise<PhotoPreviews> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const width = bitmap.width;
    const height = bitmap.height;

    const scale = (source: CanvasImageSource & { width: number; height: number }, maxWidth: number) => {
      const ratio = Math.min(1, maxWidth / source.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.width * ratio));
      canvas.height = Math.max(1, Math.round(source.height * ratio));
      canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas;
    };
    const encode = (canvas: HTMLCanvasElement, quality: number) =>
      new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob && blob.type === "image/webp" ? blob : null), "image/webp", quality);
      });

    const largeCanvas = scale(bitmap, 1600);
    bitmap.close();
    const large = await encode(largeCanvas, 0.75);
    const small = await encode(scale(largeCanvas, 480), 0.7);
    return { large, small, width, height };
  } catch {
    return EMPTY;
  }
}

/**
 * A queue of preview jobs served by a few workers. Call `dispose()` once the
 * upload run is over to terminate the workers.
 */
export function createPreviewPool() {
  const queue: Array<Pending & { id: number }> = [];
  let nextId = 0;
  let mainThreadChain: Promise<unknown> = Promise.resolve();

  const useWorkers = supportsWorkerPreviews();
  const size = useWorkers
    ? Math.max(2, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)))
    : 0;
  const workerUrl = useWorkers
    ? URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }))
    : null;

  type Slot = { worker: Worker; busy: (Pending & { id: number }) | null; broken: boolean };
  const slots: Slot[] = [];

  const runOnMainThread = (job: Pending) => {
    const run = mainThreadChain.then(() => makePreviewsOnMainThread(job.file));
    mainThreadChain = run.catch(() => null);
    run.then(job.resolve, () => job.resolve(EMPTY));
  };

  const pump = () => {
    for (const slot of slots) {
      if (slot.busy || slot.broken || queue.length === 0) continue;
      const job = queue.shift()!;
      slot.busy = job;
      slot.worker.postMessage({ id: job.id, file: job.file });
    }
    // Every worker failed to start (e.g. a restrictive CSP): drain on the main
    // thread instead of stalling the upload.
    if (slots.length > 0 && slots.every((slot) => slot.broken)) {
      while (queue.length > 0) runOnMainThread(queue.shift()!);
    }
  };

  if (workerUrl) {
    for (let i = 0; i < size; i++) {
      const slot: Slot = { worker: new Worker(workerUrl), busy: null, broken: false };
      slot.worker.onmessage = (event: MessageEvent<PhotoPreviews & { id: number }>) => {
        const job = slot.busy;
        slot.busy = null;
        if (job && job.id === event.data.id) {
          const { large, small, width, height } = event.data;
          job.resolve({ large, small, width, height });
        }
        pump();
      };
      slot.worker.onerror = () => {
        slot.broken = true;
        const job = slot.busy;
        slot.busy = null;
        if (job) runOnMainThread(job);
        pump();
      };
      slots.push(slot);
    }
  }

  return {
    make(file: File): Promise<PhotoPreviews> {
      return new Promise<PhotoPreviews>((resolve) => {
        const job = { id: nextId++, file, resolve };
        if (!useWorkers) {
          runOnMainThread(job);
          return;
        }
        queue.push(job);
        pump();
      });
    },
    dispose() {
      for (const slot of slots) slot.worker.terminate();
      for (const job of queue.splice(0)) job.resolve(EMPTY);
      for (const slot of slots) slot.busy?.resolve(EMPTY);
      if (workerUrl) URL.revokeObjectURL(workerUrl);
    },
  };
}
