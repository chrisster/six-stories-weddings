"use client";

import { useOptimistic, useState, useTransition } from "react";

import { reorderSectionsAction } from "./actions";
import { SectionRow } from "./section-row";

type Section = { id: string; name: string };

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The scenes of a gallery, in the order clients see them. Rows move with the
 * arrow buttons or by dragging; the new order shows at once and is saved in the
 * background, and the refreshed page then confirms it.
 */
export function SectionList({ sections, galleryId }: { sections: Section[]; galleryId: string }) {
  const [ordered, showOrder] = useOptimistic(sections, (_current, next: Section[]) => next);
  const [isSaving, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const commit = (next: Section[]) => {
    if (next === ordered) return;
    startTransition(async () => {
      showOrder(next);
      const formData = new FormData();
      formData.set("galleryId", galleryId);
      formData.set("orderedIds", next.map((section) => section.id).join(","));
      await reorderSectionsAction(formData);
    });
  };

  const handleDrop = (targetId: string) => {
    const from = ordered.findIndex((section) => section.id === draggedId);
    const to = ordered.findIndex((section) => section.id === targetId);
    setDraggedId(null);
    setDropTargetId(null);
    commit(moveItem(ordered, from, to));
  };

  if (ordered.length === 0) {
    return (
      <p className="mb-4 text-sm text-muted-foreground">
        No sections yet. Add one below to group the photos into scenes.
      </p>
    );
  }

  return (
    <div className="mb-4">
      <ul className="space-y-2">
        {ordered.map((section, index) => (
          <SectionRow
            key={section.id}
            section={section}
            galleryId={galleryId}
            reorder={
              ordered.length > 1
                ? {
                    canMoveUp: index > 0,
                    canMoveDown: index < ordered.length - 1,
                    onMove: (delta) => commit(moveItem(ordered, index, index + delta)),
                    isDragging: draggedId === section.id,
                    isDropTarget: dropTargetId === section.id && draggedId !== section.id,
                    onDragStart: () => setDraggedId(section.id),
                    onDragEnter: () => setDropTargetId(section.id),
                    onDragEnd: () => {
                      setDraggedId(null);
                      setDropTargetId(null);
                    },
                    onDrop: () => handleDrop(section.id),
                  }
                : undefined
            }
          />
        ))}
      </ul>
      {ordered.length > 1 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {isSaving
            ? "Saving order…"
            : "Drag a scene or use the arrows. Clients see the scenes in this order."}
        </p>
      ) : null}
    </div>
  );
}
