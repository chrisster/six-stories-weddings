"use client";

import { useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { LocationAutocomplete } from "@/components/admin/location-autocomplete";
import type { TimeplanItem } from "@/lib/types";

type TimeplanRow = {
  id: string;
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
  return initialTimeplan.map((item, index) => ({
    id: `initial-${index}`,
    time: item.time || "",
    action: item.action || "",
    location: item.location || "",
    notes: item.notes || "",
  }));
}

export function ProjectTimeplanFields({ formId, initialTimeplan }: ProjectTimeplanFieldsProps) {
  const [rows, setRows] = useState<TimeplanRow[]>(() => toRows(initialTimeplan));
  const nextIdRef = useRef(0);

  // Reordering and removing rows happen via buttons, which never emit the
  // input/change events the autosave listens for. Nudge a form control so the
  // change is picked up and persisted.
  const notifyFormChanged = () => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    form?.elements[0]?.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const addRow = () => {
    nextIdRef.current += 1;
    setRows((current) => [
      ...current,
      { id: `new-${nextIdRef.current}`, time: "", action: "", location: "", notes: "" },
    ]);
  };

  const removeRow = (id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
    notifyFormChanged();
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    setRows((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    notifyFormChanged();
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
            key={row.id}
            className="grid gap-2 rounded-xl border border-border/80 bg-zinc-50 p-3 sm:grid-cols-[110px_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]"
          >
            <input
              form={formId}
              name="timeplanTime"
              type="time"
              defaultValue={row.time}
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
            <LocationAutocomplete
              formId={formId}
              name="timeplanLocation"
              initialValue={row.location}
              placeholder="Venue or address (Google Maps)"
              className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              form={formId}
              name="timeplanNotes"
              type="text"
              defaultValue={row.notes}
              placeholder="Note"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => moveRow(index, -1)}
                disabled={index === 0}
                aria-label="Move row up"
                title="Move up"
                className="flex h-10 w-9 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground hover:border-foreground/30 disabled:cursor-default disabled:opacity-30 disabled:hover:border-border"
              >
                <ChevronUpIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => moveRow(index, 1)}
                disabled={index === rows.length - 1}
                aria-label="Move row down"
                title="Move down"
                className="flex h-10 w-9 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground hover:border-foreground/30 disabled:cursor-default disabled:opacity-30 disabled:hover:border-border"
              >
                <ChevronDownIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="h-10 rounded-xl border border-red-200 px-3 text-sm text-red-600 hover:border-red-400"
              >
                Remove
              </button>
            </div>
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
