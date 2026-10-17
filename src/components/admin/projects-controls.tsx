"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

type StatusPill = {
  key: string;
  label: string;
};

type ProjectsControlsProps = {
  initialQuery: string;
  initialStatus: string;
  initialSort: string;
  initialPeriod: string;
  statusOptions: StatusPill[];
  statusCounts: Record<string, number>;
};

export function ProjectsControls({
  initialQuery,
  initialStatus,
  initialSort,
  initialPeriod,
  statusOptions,
  statusCounts,
}: ProjectsControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState(initialSort);
  const [period, setPeriod] = useState(initialPeriod);

  // Back/forward or a link can change the filters from outside; adopt the
  // server's values whenever they change (adjusting state during render).
  const filtersKey = `${initialStatus}|${initialSort}|${initialPeriod}`;
  const [seenFiltersKey, setSeenFiltersKey] = useState(filtersKey);
  if (seenFiltersKey !== filtersKey) {
    setSeenFiltersKey(filtersKey);
    setStatus(initialStatus);
    setSort(initialSort);
    setPeriod(initialPeriod);
  }

  // The text search only filters the cards already on the page (ProjectsGrid
  // reads ?q=), so it updates the URL with history.replaceState instead of a
  // navigation. A navigation re-renders the page on the server behind the
  // loading skeleton, which remounted this input and dropped keystrokes.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      const normalizedQ = query.trim();
      if (normalizedQ) {
        next.set("q", normalizedQ);
      } else {
        next.delete("q");
      }
      const queryString = next.toString();
      if (queryString === window.location.search.replace(/^\?/, "")) return;
      window.history.replaceState(null, "", queryString ? `${pathname}?${queryString}` : pathname);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [query, pathname]);

  // Status, sort and period change the numbers on the page, so they re-render
  // it on the server.
  function applyFilter(key: "status" | "sort" | "period", value: string, fallback: string) {
    const next = new URLSearchParams(window.location.search);
    if (value && value !== fallback) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    const queryString = next.toString();
    startTransition(() => {
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="mb-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_220px_180px]">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects"
          className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
        />

        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            applyFilter("sort", event.target.value, "date_desc");
          }}
          className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
        >
          <option value="date_desc">Newest date</option>
          <option value="date_asc">Oldest date</option>
          <option value="name_asc">Name A-Z</option>
          <option value="name_desc">Name Z-A</option>
          <option value="status_asc">Status</option>
        </select>

        <select
          value={period}
          onChange={(event) => {
            setPeriod(event.target.value);
            applyFilter("period", event.target.value, "all");
          }}
          className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
        >
          <option value="all">All time</option>
          <option value="2025">2025</option>
          <option value="2026">2026</option>
          <option value="2027">2027</option>
          <option value="2028">2028</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusOptions.map((pill) => (
          <button
            key={pill.key}
            type="button"
            onClick={() => {
              setStatus(pill.key);
              applyFilter("status", pill.key, "all");
            }}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              status === pill.key
                ? "border-foreground/45 bg-foreground/10 text-foreground"
                : "border-border bg-white text-muted-foreground hover:text-foreground"
            }`}
          >
            {pill.label} ({statusCounts[pill.key] || 0})
          </button>
        ))}
      </div>
    </div>
  );
}
