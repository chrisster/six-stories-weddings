"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type StatusPill = {
  key: string;
  label: string;
  cls: string;
};

type ProjectsControlsProps = {
  initialQuery: string;
  initialStatus: string;
  initialSort: string;
  statusPills: StatusPill[];
  statusCounts: Record<string, number>;
};

export function ProjectsControls({
  initialQuery,
  initialStatus,
  initialSort,
  statusPills,
  statusCounts,
}: ProjectsControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState(initialSort);

  useEffect(() => {
    setQuery(initialQuery);
    setStatus(initialStatus);
    setSort(initialSort);
  }, [initialQuery, initialStatus, initialSort]);

  const paramsString = useMemo(() => searchParams.toString(), [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(paramsString);
      const normalizedQ = query.trim();

      if (normalizedQ) {
        next.set("q", normalizedQ);
      } else {
        next.delete("q");
      }

      if (status && status !== "all") {
        next.set("status", status);
      } else {
        next.delete("status");
      }

      if (sort && sort !== "date_desc") {
        next.set("sort", sort);
      } else {
        next.delete("sort");
      }

      const queryString = next.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [query, status, sort, pathname, router, paramsString]);

  return (
    <div className="mb-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects"
          className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
        />

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
        >
          <option value="date_desc">Newest date</option>
          <option value="date_asc">Oldest date</option>
          <option value="name_asc">Name A-Z</option>
          <option value="name_desc">Name Z-A</option>
          <option value="status_asc">Status</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusPills.map((pill) => (
          <button
            key={pill.key}
            type="button"
            onClick={() => setStatus(pill.key)}
            className={`rounded-full border px-3 py-1 text-sm transition ${pill.cls} ${
              status === pill.key ? "ring-1 ring-foreground/35" : "opacity-85 hover:opacity-100"
            }`}
          >
            {pill.label} ({statusCounts[pill.key] || 0})
          </button>
        ))}
      </div>
    </div>
  );
}
