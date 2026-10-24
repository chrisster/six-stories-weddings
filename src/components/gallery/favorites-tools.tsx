"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, FileText, List } from "lucide-react";

export type FavoriteItem = {
  id: string;
  name: string;
  section: string;
  hearts: number;
  type: "photo" | "video";
};

function baseName(name: string) {
  return name.replace(/\.[^./]+$/, "");
}

/** Admin: download the favorite photos and see / copy / export their file names. */
export function FavoritesTools({ galleryId, items }: { galleryId: string; items: FavoriteItem[] }) {
  const [showList, setShowList] = useState(false);
  const [copied, setCopied] = useState<"names" | "lightroom" | null>(null);
  const [preparing, setPreparing] = useState(false);

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [items],
  );
  const photoCount = items.filter((item) => item.type === "photo").length;

  const copy = async (kind: "names" | "lightroom") => {
    // Lightroom's "Text" filter matches any of several comma-separated words,
    // so names without extensions select the same photos in a catalog.
    const text =
      kind === "names"
        ? sorted.map((item) => item.name).join("\n")
        : sorted.map((item) => baseName(item.name)).join(", ");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy the file names:", text);
    }
  };

  const downloadCsv = () => {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      ["File name", "Section", "Type", "Hearts"].join(","),
      ...sorted.map((item) =>
        [escape(item.name), escape(item.section), item.type, String(item.hearts)].join(","),
      ),
    ];
    const blob = new Blob([`﻿${rows.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "favorites.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadZip = () => {
    setPreparing(true);
    const link = document.createElement("a");
    link.href = `/api/admin/galleries/${galleryId}/favorites-zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => setPreparing(false), 60 * 1000);
  };

  const buttonClass =
    "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs transition hover:border-foreground/40 disabled:opacity-50";

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {photoCount > 0 ? (
          <button type="button" onClick={downloadZip} disabled={preparing} className={buttonClass}>
            <Download className="size-3.5" />
            {preparing ? "Preparing zip… (may take a minute)" : `Download favorite photos (${photoCount})`}
          </button>
        ) : null}
        <button type="button" onClick={() => setShowList((value) => !value)} className={buttonClass}>
          <List className="size-3.5" />
          {showList ? "Hide file names" : `Show file names (${items.length})`}
        </button>
        <button type="button" onClick={() => void copy("names")} className={buttonClass}>
          {copied === "names" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied === "names" ? "Copied" : "Copy names"}
        </button>
        <button
          type="button"
          onClick={() => void copy("lightroom")}
          title="Comma-separated names without extensions, for Lightroom's Text filter"
          className={buttonClass}
        >
          {copied === "lightroom" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied === "lightroom" ? "Copied" : "Copy for Lightroom"}
        </button>
        <button type="button" onClick={downloadCsv} className={buttonClass}>
          <FileText className="size-3.5" />
          Export CSV
        </button>
      </div>

      {showList ? (
        <div className="max-h-96 overflow-auto rounded-xl border border-border/70">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted/80 text-xs uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 font-medium">File name</th>
                <th className="px-3 py-2 font-medium">Section</th>
                <th className="px-3 py-2 text-right font-medium">&#9829;</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.id} className="border-t border-border/60">
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {item.name}
                    {item.type === "video" ? (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-sans text-[10px] uppercase text-muted-foreground">
                        video
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{item.section}</td>
                  <td className="px-3 py-1.5 text-right text-xs">{item.hearts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
