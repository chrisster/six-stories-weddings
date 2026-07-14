"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type UploadProgress = {
  fileIndex: number;
  fileName: string;
  progress: number;
  status: "uploading" | "completed" | "failed";
  error?: string;
  file: File;
};

type MediaUploaderProps = {
  galleryId: string;
  sections: Array<{ id: string; name: string }>;
  accept?: string;
};

export function MediaUploader({ galleryId, sections, accept = "image/*,video/*" }: MediaUploaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  async function prepareFileForUpload(file: File): Promise<File> {
    // Vercel serverless request bodies can fail on larger payloads.
    // Compress only large images client-side to improve reliability.
    const MAX_SAFE_BYTES = 4 * 1024 * 1024;
    if (!file.type.startsWith("image/") || file.size <= MAX_SAFE_BYTES) {
      return file;
    }

    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const maxDimension = 2800;
    const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.86);
    });

    if (!blob) {
      return file;
    }

    const base = file.name.replace(/\.[^/.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
    setProgress([]);
  };

  async function uploadSingleFile(item: UploadProgress): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/galleries/upload");

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const percent = Math.round((event.loaded / event.total) * 100);
        setProgress((prev) =>
          prev.map((entry) =>
            entry.fileIndex === item.fileIndex ? { ...entry, progress: percent } : entry,
          ),
        );
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress((prev) =>
            prev.map((entry) =>
              entry.fileIndex === item.fileIndex
                ? { ...entry, status: "completed", progress: 100, error: undefined }
                : entry,
            ),
          );
          resolve();
          return;
        }

        let message = "Upload failed.";
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string };
          if (parsed.error) {
            message = parsed.error;
          }
        } catch {
          const snippet = xhr.responseText?.slice(0, 120).replace(/\s+/g, " ") || "No response body.";
          if (xhr.status === 413) {
            message = "File is too large for this upload path. Try a smaller/compressed image.";
          } else {
            message = `Unexpected server response (${xhr.status}): ${snippet}`;
          }
        }

        setProgress((prev) =>
          prev.map((entry) =>
            entry.fileIndex === item.fileIndex
              ? { ...entry, status: "failed", error: message }
              : entry,
          ),
        );
        reject(new Error(message));
      };

      xhr.onerror = () => {
        const message = "Network error while uploading.";
        setProgress((prev) =>
          prev.map((entry) =>
            entry.fileIndex === item.fileIndex
              ? { ...entry, status: "failed", error: message }
              : entry,
          ),
        );
        reject(new Error(message));
      };

      const formData = new FormData();
      formData.append("galleryId", galleryId);
      formData.append("file", item.file);
      if (selectedSectionId) {
        formData.append("sectionId", selectedSectionId);
      }

      xhr.send(formData);
    });
  }

  // Uploads a single part to its presigned URL and resolves with the ETag that
  // R2 returns (required to complete the multipart upload). R2 CORS must expose
  // the ETag response header for this to work from the browser.
  function putPart(
    url: string,
    chunk: Blob,
    uploadedBytes: number,
    totalBytes: number,
    setEntry: (patch: Partial<UploadProgress>) => void,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const overall = Math.round(((uploadedBytes + event.loaded) / totalBytes) * 100);
        setEntry({ progress: Math.min(99, overall) });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = xhr.getResponseHeader("ETag") || xhr.getResponseHeader("etag");
          if (!etag) {
            reject(
              new Error("Missing ETag from storage. Configure R2 CORS to expose the ETag header."),
            );
            return;
          }
          resolve(etag);
          return;
        }
        reject(new Error(`Upload failed (${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error("Network error while uploading video."));
      xhr.send(chunk);
    });
  }

  async function uploadVideoMultipart(
    item: UploadProgress,
    storagePath: string,
    uploadId: string,
    setEntry: (patch: Partial<UploadProgress>) => void,
  ): Promise<void> {
    const file = item.file;
    const PART_SIZE = 100 * 1024 * 1024; // 100 MB per part.
    const totalParts = Math.max(1, Math.ceil(file.size / PART_SIZE));
    const parts: Array<{ partNumber: number; etag: string }> = [];
    let uploadedBytes = 0;

    try {
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * PART_SIZE;
        const end = Math.min(start + PART_SIZE, file.size);
        const chunk = file.slice(start, end);

        const signResponse = await fetch("/api/admin/galleries/video-multipart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sign-part", storagePath, uploadId, partNumber }),
        });
        if (!signResponse.ok) {
          throw new Error("Could not sign upload part.");
        }
        const { url } = (await signResponse.json()) as { url: string };

        const etag = await putPart(url, chunk, uploadedBytes, file.size, setEntry);
        parts.push({ partNumber, etag });
        uploadedBytes += end - start;
      }

      const completeResponse = await fetch("/api/admin/galleries/video-multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", storagePath, uploadId, parts }),
      });
      if (!completeResponse.ok) {
        throw new Error("Could not finalize video upload.");
      }
    } catch (error) {
      // Discard any uploaded parts so they do not linger and incur storage cost.
      await fetch("/api/admin/galleries/video-multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "abort", storagePath, uploadId }),
      }).catch(() => null);
      const message = error instanceof Error ? error.message : "Video upload failed.";
      setEntry({ status: "failed", error: message });
      throw new Error(message);
    }

    const registerResponse = await fetch("/api/admin/galleries/register-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryId,
        sectionId: selectedSectionId || undefined,
        storagePath,
        originalName: item.file.name,
        contentType: item.file.type || "video/mp4",
      }),
    });

    if (!registerResponse.ok) {
      const message = await registerResponse
        .json()
        .then((data: { error?: string }) => data.error)
        .catch(() => null);
      setEntry({ status: "failed", error: message || "Could not save video." });
      throw new Error(message || "Could not save video.");
    }

    setEntry({ status: "completed", progress: 100, error: undefined });
  }

  // Videos can be large and exceed the serverless request-body limit, so they
  // are uploaded directly to storage. On R2 we use multipart upload (chunked)
  // because a single presigned PUT is capped at 5 GiB and its URL would expire
  // before a multi-GB transfer finishes. Non-R2 storage falls back to a single
  // short-lived signed URL.
  async function uploadVideoDirect(item: UploadProgress): Promise<void> {
    const setEntry = (patch: Partial<UploadProgress>) => {
      setProgress((prev) =>
        prev.map((entry) => (entry.fileIndex === item.fileIndex ? { ...entry, ...patch } : entry)),
      );
    };

    // Try the R2 multipart path first. A 409 means R2 is not the active
    // provider, so we fall back to the single signed-URL upload below.
    const createResponse = await fetch("/api/admin/galleries/video-multipart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        galleryId,
        fileName: item.file.name,
        contentType: item.file.type || "video/mp4",
      }),
    });

    if (createResponse.ok) {
      const { storagePath, uploadId } = (await createResponse.json()) as {
        storagePath: string;
        uploadId: string;
      };
      await uploadVideoMultipart(item, storagePath, uploadId, setEntry);
      return;
    }

    if (createResponse.status !== 409) {
      const message = await createResponse
        .json()
        .then((data: { error?: string }) => data.error)
        .catch(() => null);
      setEntry({ status: "failed", error: message || "Could not start video upload." });
      throw new Error(message || "Could not start video upload.");
    }

    const urlResponse = await fetch("/api/admin/galleries/video-upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryId,
        fileName: item.file.name,
        contentType: item.file.type || "video/mp4",
      }),
    });

    if (!urlResponse.ok) {
      const message = await urlResponse
        .json()
        .then((data: { error?: string }) => data.error)
        .catch(() => null);
      setEntry({ status: "failed", error: message || "Could not start video upload." });
      throw new Error(message || "Could not start video upload.");
    }

    const { storagePath, target } = (await urlResponse.json()) as {
      storagePath: string;
      target:
        | { provider: "r2"; url: string; path: string }
        | { provider: "supabase"; bucket: string; path: string; token: string };
    };

    if (target.provider === "r2") {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", target.url);
        xhr.setRequestHeader("Content-Type", item.file.type || "video/mp4");
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setEntry({ progress: Math.round((event.loaded / event.total) * 100) });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed (${xhr.status}).`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error while uploading video."));
        xhr.send(item.file);
      });
    } else {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      setEntry({ progress: 40 });
      const { error } = await supabase.storage
        .from(target.bucket)
        .uploadToSignedUrl(target.path, target.token, item.file, {
          contentType: item.file.type || "video/mp4",
        });
      if (error) {
        setEntry({ status: "failed", error: error.message });
        throw new Error(error.message);
      }
      setEntry({ progress: 90 });
    }

    const registerResponse = await fetch("/api/admin/galleries/register-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryId,
        sectionId: selectedSectionId || undefined,
        storagePath,
        originalName: item.file.name,
        contentType: item.file.type || "video/mp4",
      }),
    });

    if (!registerResponse.ok) {
      const message = await registerResponse
        .json()
        .then((data: { error?: string }) => data.error)
        .catch(() => null);
      setEntry({ status: "failed", error: message || "Could not save video." });
      throw new Error(message || "Could not save video.");
    }

    setEntry({ status: "completed", progress: 100, error: undefined });
  }

  async function uploadItem(item: UploadProgress): Promise<void> {
    if ((item.file.type || "").startsWith("video/")) {
      return uploadVideoDirect(item);
    }
    return uploadSingleFile(item);
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || isUploading) {
      return;
    }

    const prepared = await Promise.all(selectedFiles.map((file) => prepareFileForUpload(file)));

    const queued: UploadProgress[] = prepared.map((file, index) => ({
      fileIndex: index,
      fileName: file.name,
      progress: 0,
      status: "uploading",
      file,
    }));

    setIsUploading(true);
    setProgress(queued);

    try {
      for (const item of queued) {
        await uploadItem(item);
      }

      router.refresh();
      setTimeout(() => {
        setSelectedFiles([]);
        setProgress([]);
        setSelectedSectionId("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }, 800);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetryFailed = async () => {
    const failed = progress.filter((entry) => entry.status === "failed");
    if (failed.length === 0 || isUploading) {
      return;
    }

    setIsUploading(true);
    setProgress((prev) =>
      prev.map((entry) =>
        entry.status === "failed"
          ? { ...entry, status: "uploading", progress: 0, error: undefined }
          : entry,
      ),
    );

    try {
      for (const item of failed) {
        await uploadItem(item);
      }
      router.refresh();
    } finally {
      setIsUploading(false);
    }
  };

  const completedCount = progress.filter((p) => p.status === "completed").length;
  const failedCount = progress.filter((p) => p.status === "failed").length;

  return (
    <div className="space-y-4">
      {progress.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple
            onChange={handleFileSelect}
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
            disabled={selectedFiles.length === 0 || isUploading}
            className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {selectedFiles.length > 0
              ? `Upload ${selectedFiles.length} file${selectedFiles.length !== 1 ? "s" : ""}`
              : "Select files"}
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">
              {completedCount > 0 && `${completedCount} completed`}
              {failedCount > 0 && ` · ${failedCount} failed`}
              {progress.filter((p) => p.status === "uploading").length > 0 &&
                ` · Uploading...`}
            </span>
          </div>

          {progress.map((item) => (
            <div key={item.fileIndex} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate text-muted-foreground">{item.fileName}</span>
                {item.status === "completed" && <span className="text-emerald-600">✓</span>}
                {item.status === "failed" && <span className="text-red-600">✗</span>}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white">
                <div
                  className={`h-full transition-all ${
                    item.status === "completed"
                      ? "bg-emerald-500"
                      : item.status === "failed"
                        ? "bg-red-500"
                        : "bg-foreground"
                  }`}
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              {item.error && (
                <p className="text-xs text-red-600">{item.error}</p>
              )}
            </div>
          ))}

          {failedCount > 0 && (
            <button
              type="button"
              onClick={handleRetryFailed}
              disabled={isUploading}
              className="mt-3 text-xs text-foreground underline hover:no-underline disabled:opacity-50"
            >
              Retry failed uploads
            </button>
          )}

          {completedCount === progress.length && failedCount === 0 && (
            <p className="text-xs text-emerald-600">All files uploaded successfully!</p>
          )}
        </div>
      )}
    </div>
  );
}
