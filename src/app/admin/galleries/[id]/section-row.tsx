"use client";

import { useState } from "react";

import { deleteSectionAction, renameSectionAction } from "./actions";

type Section = { id: string; name: string };

export function SectionRow({ section, galleryId }: { section: Section; galleryId: string }) {
  const [renaming, setRenaming] = useState(false);

  return (
    <>
      {renaming ? (
        <li className="rounded-xl border border-border/80 bg-white px-3 py-2">
          <form
            action={async (fd) => { await renameSectionAction(fd); setRenaming(false); }}
            className="flex gap-2"
          >
            <input type="hidden" name="sectionId" value={section.id} />
            <input type="hidden" name="galleryId" value={galleryId} />
            <input
              name="name"
              required
              defaultValue={section.name}
              autoFocus
              className="h-8 flex-1 rounded-lg border border-border px-2 text-sm"
            />
            <button type="submit" className="h-8 rounded-lg border border-foreground bg-foreground px-3 text-xs text-background transition hover:opacity-90">
              Save
            </button>
            <button type="button" onClick={() => setRenaming(false)} className="h-8 rounded-lg border border-border px-3 text-xs hover:border-foreground/30">
              Cancel
            </button>
          </form>
        </li>
      ) : (
        <li className="flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-white px-3 py-2 text-sm">
          <span>{section.name}</span>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => setRenaming(true)}
              className="h-7 rounded-lg border border-border px-2 text-xs hover:border-foreground/40"
            >
              Rename
            </button>
            <form action={deleteSectionAction}>
              <input type="hidden" name="sectionId" value={section.id} />
              <input type="hidden" name="galleryId" value={galleryId} />
              <button type="submit" className="h-7 rounded-lg border border-red-200 px-2 text-xs text-red-600 hover:border-red-400">
                Delete
              </button>
            </form>
          </div>
        </li>
      )}
    </>
  );
}
