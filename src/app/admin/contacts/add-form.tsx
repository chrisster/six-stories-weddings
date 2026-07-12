"use client";

import { useState } from "react";

import { createContactAction } from "./actions";

const inputCls = "h-10 w-full rounded-xl border border-border bg-white px-3 text-sm";
const labelCls = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

export function AddContactForm() {
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setEmailError(null);
    const result = await createContactAction(formData);
    if (result?.error) {
      setEmailError(result.error);
    }
  }

  return (
    <form action={handleSubmit} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <input type="hidden" name="status" value="lead" />

      <div className="space-y-1">
        <label className={labelCls}>Full Name *</label>
        <input name="fullName" required placeholder="Full name" className={inputCls} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Email</label>
        <input name="email" type="email" placeholder="Email" className={inputCls} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Phone</label>
        <input name="phone" placeholder="Phone" className={inputCls} />
      </div>
      <div className="space-y-1 sm:col-span-2 xl:col-span-1">
        <label className={labelCls}>Notes</label>
        <input name="notes" placeholder="Notes" className={inputCls} />
      </div>

      {emailError && (
        <p className="text-sm text-red-600 sm:col-span-2 xl:col-span-4">{emailError}</p>
      )}

      <button
        type="submit"
        className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background sm:justify-self-start"
      >
        Add Client
      </button>
    </form>
  );
}
