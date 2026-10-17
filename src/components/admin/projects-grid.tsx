"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

export type ProjectsGridItem = {
  id: string;
  /** Lower-cased title and client names, matched against the search box. */
  searchText: string;
  card: ReactNode;
};

/**
 * Filters the server-rendered project cards by the `q` search param on the
 * client. The search box writes `q` with history.replaceState, so typing never
 * waits on (or remounts behind) a server render.
 */
export function ProjectsGrid({ items }: { items: ProjectsGridItem[] }) {
  const q = (useSearchParams().get("q") || "").trim().toLowerCase();
  const visible = q ? items.filter((item) => item.searchText.includes(q)) : items;

  if (visible.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">No projects found.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((item) => (
        <div key={item.id} className="contents">
          {item.card}
        </div>
      ))}
    </div>
  );
}
