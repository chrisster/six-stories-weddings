"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { autosaveProjectAction } from "@/app/admin/projects/actions";

type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

type ProjectAutosaveProps = {
  formId: string;
  debounceMs?: number;
};

export function ProjectAutosave({ formId, debounceMs = 1500 }: ProjectAutosaveProps) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);

  const runSave = useCallback(async () => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    // Skip when required fields are invalid to avoid persisting bad data.
    if (!form.checkValidity()) {
      setStatus("idle");
      return;
    }

    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }

    savingRef.current = true;
    setStatus("saving");

    try {
      const formData = new FormData(form);
      const result = await autosaveProjectAction(formData);
      setStatus(result.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void runSave();
      }
    }
  }, [formId]);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const schedule = () => {
      setStatus("pending");
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        void runSave();
      }, debounceMs);
    };

    form.addEventListener("input", schedule);
    form.addEventListener("change", schedule);

    return () => {
      form.removeEventListener("input", schedule);
      form.removeEventListener("change", schedule);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [formId, debounceMs, runSave]);

  const label =
    status === "saving"
      ? "Saving…"
      : status === "pending"
        ? "Editing…"
        : status === "saved"
          ? "All changes saved"
          : status === "error"
            ? "Autosave failed"
            : "Autosave on";

  const dotClass =
    status === "saving" || status === "pending"
      ? "bg-amber-400"
      : status === "saved"
        ? "bg-emerald-500"
        : status === "error"
          ? "bg-red-500"
          : "bg-zinc-300";

  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className={`size-2 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}
