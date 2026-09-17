"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, GripVertical } from "lucide-react";

import { deleteSectionAction, renameSectionAction } from "./actions";

type Section = { id: string; name: string };

/** Supplied by SectionList when there is more than one scene to order. */
export type SectionReorderControls = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: -1 | 1) => void;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
};

const arrowClass =
  "flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-foreground/40 hover:text-foreground disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground";

export function SectionRow({
  section,
  galleryId,
  reorder,
}: {
  section: Section;
  galleryId: string;
  reorder?: SectionReorderControls;
}) {
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
        <li
          draggable={Boolean(reorder)}
          onDragStart={(event) => {
            if (!reorder) return;
            event.dataTransfer.effectAllowed = "move";
            // Firefox only starts a drag when some data is set.
            event.dataTransfer.setData("text/plain", section.id);
            reorder.onDragStart();
          }}
          onDragEnter={() => reorder?.onDragEnter()}
          onDragOver={(event) => {
            if (!reorder) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDragEnd={() => reorder?.onDragEnd()}
          onDrop={(event) => {
            if (!reorder) return;
            event.preventDefault();
            reorder.onDrop();
          }}
          className={`flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-sm transition ${
            reorder?.isDropTarget ? "border-foreground/60 bg-foreground/[0.03]" : "border-border/80"
          } ${reorder?.isDragging ? "opacity-50" : ""}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            {reorder ? (
              <GripVertical
                className="size-4 shrink-0 cursor-grab text-muted-foreground/70"
                strokeWidth={1.8}
                aria-hidden
              />
            ) : null}
            <span className="truncate">{section.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {reorder ? (
              <>
                <button
                  type="button"
                  onClick={() => reorder.onMove(-1)}
                  disabled={!reorder.canMoveUp}
                  className={arrowClass}
                  aria-label={`Move ${section.name} up`}
                >
                  <ChevronUpIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => reorder.onMove(1)}
                  disabled={!reorder.canMoveDown}
                  className={arrowClass}
                  aria-label={`Move ${section.name} down`}
                >
                  <ChevronDownIcon className="size-4" />
                </button>
              </>
            ) : null}
            <button
              type="button"
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
