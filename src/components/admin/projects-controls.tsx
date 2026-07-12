"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState(initialSort);
  const [period, setPeriod] = useState(initialPeriod);

  useEffect(() => {
    setQuery(initialQuery);
    setStatus(initialStatus);
    setSort(initialSort);
    setPeriod(initialPeriod);
  }, [initialQuery, initialStatus, initialSort, initialPeriod]);

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

      if (period && period !== "all") {
        next.set("period", period);
      } else {
        next.delete("period");
      }

      const queryString = next.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [query, status, sort, period, pathname, router, paramsString]);

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
          onChange={(event) => setSort(event.target.value)}
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
          onChange={(event) => setPeriod(event.target.value)}
          className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
        >
          <option value="all">All time</option>
          <option value="this_week">This week</option>
          <option value="this_month">This month</option>
          <option value="this_year">This year</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusOptions.map((pill) => (
          <button
            key={pill.key}
            type="button"
            onClick={() => setStatus(pill.key)}
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
