"use client";

import { useState } from "react";

import { createContactAction, createCrewMemberAction } from "./actions";

const inputCls = "h-10 w-full rounded-xl border border-border bg-white px-3 text-sm";
const labelCls = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

export function AddContactForm() {
  const [type, setType] = useState<"client" | "crew">("client");

  async function handleSubmit(formData: FormData) {
    if (type === "crew") {
      await createCrewMemberAction(formData);
    } else {
      await createContactAction(formData);
    }
  }

  return (
    <form action={handleSubmit} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {/* Type toggle */}
      <div className="space-y-1 sm:col-span-2 xl:col-span-4">
        <label className={labelCls}>Type</label>
        <div className="flex gap-2">
          {(["client", "crew"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-xl border px-5 py-2 text-sm font-medium transition capitalize ${
                type === t
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-white hover:border-foreground/30"
              }`}
            >
              {t === "client" ? "Client" : "Crew"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className={labelCls}>Full Name *</label>
        <input name="fullName" required placeholder="Full name" className={inputCls} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Email</label>
        <input name="email" type="email" placeholder="Email" className={inputCls} />
      </div>

      {type === "crew" ? (
        <div className="space-y-1">
          <label className={labelCls}>Role</label>
          <select name="roleType" defaultValue="photographer" className={inputCls}>
            <option value="photographer">Photographer</option>
            <option value="videographer">Videographer</option>
            <option value="editor">Editor</option>
            <option value="assistant">Assistant</option>
            <option value="partner">Partner</option>
          </select>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <label className={labelCls}>Phone</label>
            <input name="phone" placeholder="Phone" className={inputCls} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className={labelCls}>Notes</label>
            <input name="notes" placeholder="Notes" className={inputCls} />
          </div>
        </>
      )}

      {/* Hidden defaults for unused fields */}
      {type === "crew" && <input type="hidden" name="phone" value="" />}
      {type === "client" && <input type="hidden" name="status" value="lead" />}

      <button
        type="submit"
        className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background sm:justify-self-start"
      >
        Add {type === "client" ? "Client" : "Crew Member"}
      </button>
    </form>
  );
}
