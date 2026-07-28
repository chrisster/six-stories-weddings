"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

import {
  clearGalleryHeroImageAction,
  setGalleryHeroImageAction,
} from "@/app/admin/galleries/[id]/actions";

type HeroImageUploaderProps = {
  galleryId: string;
  hasCustomHero: boolean;
};

// Downscale the chosen image before upload so large exports stay within the
// serverless request-body limit and the hero loads quickly.
async function prepareHeroImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const maxDimension = 2400;
  const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/jpeg", 0.85);
  });

  if (!blob) {
    return file;
  }

  const base = file.name.replace(/\.[^/.]+$/, "");
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

export function HeroImageUploader({ galleryId, hasCustomHero }: HeroImageUploaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setBusy(true);
    try {
      const prepared = await prepareHeroImage(file);
      const formData = new FormData();
      formData.append("galleryId", galleryId);
      formData.append("file", prepared);
      await setGalleryHeroImageAction(formData);
      router.refresh();
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("galleryId", galleryId);
      await clearGalleryHeroImageAction(formData);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelect}
        disabled={busy}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-white disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
        {hasCustomHero ? "Replace hero image" : "Upload hero image"}
      </button>
      {hasCustomHero ? (
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          aria-label="Remove custom hero image"
          className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/60 disabled:opacity-60"
        >
          <Trash2 className="size-3.5" />
          Remove
        </button>
      ) : null}
    </div>
  );
}
