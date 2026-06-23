"use client";

import { useRef, useState } from "react";

type ProjectSaveButtonProps = {
  formId: string;
};

export function ProjectSaveButton({ formId }: ProjectSaveButtonProps) {
  const [isSaving, setIsSaving] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  function handleSave() {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) {
      return;
    }

    setIsSaving(true);

    // Fallback reset if the action does not navigate away (e.g. validation/server no-op).
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => setIsSaving(false), 8000);

    form.requestSubmit();
  }

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={isSaving}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background disabled:opacity-75"
    >
      {isSaving ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-background/40 border-t-background" />
          Saving...
        </>
      ) : (
        "Save"
      )}
    </button>
  );
}
