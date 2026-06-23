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
};

export function MediaUploader({ galleryId, sections }: MediaUploaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

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
          message = "An unexpected response was received from the server.";
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

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || isUploading) {
      return;
    }

    const queued: UploadProgress[] = selectedFiles.map((file, index) => ({
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
        await uploadSingleFile(item);
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
        await uploadSingleFile(item);
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
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileSelect}
            className="h-10 rounded-xl border border-border px-3 py-2 text-sm"
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
            className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background disabled:opacity-50"
          >
            {selectedFiles.length > 0
              ? `Upload ${selectedFiles.length} file${selectedFiles.length !== 1 ? "s" : ""}`
              : "Select files"}
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
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
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/50">
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
