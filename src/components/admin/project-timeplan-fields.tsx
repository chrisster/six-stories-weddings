"use client";

import { useState } from "react";

import type { TimeplanItem } from "@/lib/types";

type TimeplanRow = {
  time: string;
  action: string;
  location: string;
  notes: string;
};

type ProjectTimeplanFieldsProps = {
  formId: string;
  initialTimeplan: TimeplanItem[];
};

function toRows(initialTimeplan: TimeplanItem[]): TimeplanRow[] {
  return initialTimeplan.map((item) => ({
    time: item.time || "",
    action: item.action || "",
    location: item.location || "",
    notes: item.notes || "",
  }));
}

export function ProjectTimeplanFields({ formId, initialTimeplan }: ProjectTimeplanFieldsProps) {
  const [rows, setRows] = useState<TimeplanRow[]>(toRows(initialTimeplan));

  const addRow = () => {
    setRows((current) => [...current, { time: "", action: "", location: "", notes: "" }]);
  };

  const removeRow = (index: number) => {
    setRows((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div className="space-y-2">
      <div className="hidden gap-2 px-1 text-xs uppercase tracking-[0.12em] text-muted-foreground sm:grid sm:grid-cols-[110px_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]">
        <span>Time</span>
        <span>Action</span>
        <span>Location</span>
        <span>Notes</span>
        <span className="text-right">&nbsp;</span>
      </div>

      {rows.length > 0 ? (
        rows.map((row, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-xl border border-border/80 bg-zinc-50 p-3 sm:grid-cols-[110px_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]"
          >
            <input
              form={formId}
              name="timeplanTime"
              type="text"
              defaultValue={row.time}
              placeholder="14:30"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              form={formId}
              name="timeplanAction"
              type="text"
              defaultValue={row.action}
              placeholder="Ceremony"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              form={formId}
              name="timeplanLocation"
              type="text"
              defaultValue={row.location}
              placeholder="Venue or address (Google Maps)"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              form={formId}
              name="timeplanNotes"
              type="text"
              defaultValue={row.notes}
              placeholder="Note"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="h-10 rounded-xl border border-red-200 px-3 text-sm text-red-600 hover:border-red-400"
            >
              Remove
            </button>
          </div>
        ))
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-zinc-50 px-3 py-3 text-sm text-muted-foreground">
          No timeplan entries yet. Add the first moment of the day.
        </p>
      )}

      <button
        type="button"
        onClick={addRow}
        className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30"
      >
        Add timeplan row
      </button>
    </div>
  );
}
