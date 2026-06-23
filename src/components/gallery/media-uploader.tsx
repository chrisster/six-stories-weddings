"use client";

import { useRef, useState } from "react";
import { uploadMediaAction } from "@/app/admin/galleries/[id]/actions";

type UploadProgress = {
  fileIndex: number;
  fileName: string;
  progress: number;
  status: "uploading" | "completed" | "failed";
  error?: string;
};

type MediaUploaderProps = {
  galleryId: string;
  sections: Array<{ id: string; name: string }>;
};

export function MediaUploader({ galleryId, sections }: MediaUploaderProps) {
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

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    const newProgress: UploadProgress[] = selectedFiles.map((file, index) => ({
      fileIndex: index,
      fileName: file.name,
      progress: 0,
      status: "uploading",
    }));
    setProgress(newProgress);

    const formData = new FormData();
    formData.append("galleryId", galleryId);
    if (selectedSectionId) {
      formData.append("sectionId", selectedSectionId);
    }
    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((prev) =>
          prev.map((p) =>
            p.status === "uploading"
              ? { ...p, progress: Math.min(p.progress + Math.random() * 30, 90) }
              : p,
          ),
        );
      }, 300);

      // Execute the server action
      const result = await uploadMediaAction(formData);

      clearInterval(progressInterval);

      // Mark all as completed
      setProgress((prev) =>
        prev.map((p) => ({
          ...p,
          status: "completed",
          progress: 100,
        })),
      );

      // Reset after a short delay
      setTimeout(() => {
        setSelectedFiles([]);
        setProgress([]);
        setSelectedSectionId("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }, 1500);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Upload failed";
      setProgress((prev) =>
        prev.map((p) => ({
          ...p,
          status: "failed",
          error: errorMessage,
        })),
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetry = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
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
              onClick={handleRetry}
              className="mt-3 text-xs text-foreground underline hover:no-underline"
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
