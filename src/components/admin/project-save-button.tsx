"use client";

import { useState } from "react";

type ProjectSaveButtonProps = {
  formId: string;
};

export function ProjectSaveButton({ formId }: ProjectSaveButtonProps) {
  const [isSaving, setIsSaving] = useState(false);

  function handleSave() {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) {
      return;
    }

    // Do not enter loading state if the form is invalid.
    if (!form.reportValidity()) {
      return;
    }

    setIsSaving(true);

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
