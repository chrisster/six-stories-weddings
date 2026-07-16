"use client";

import { useEffect, useRef, useState } from "react";

type LocationSuggestion = {
  label: string;
};

type LocationAutocompleteProps = {
  formId: string;
  name: string;
  initialValue?: string;
  placeholder?: string;
  className?: string;
};

export function LocationAutocomplete({
  formId,
  name,
  initialValue = "",
  placeholder,
  className,
}: LocationAutocompleteProps) {
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const skipNextFetchRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);

        const url = `/api/admin/places-autocomplete?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          setSuggestions([]);
          return;
        }

        const data = (await response.json()) as {
          suggestions?: Array<{ label?: string }>;
        };

        const mapped = (data.suggestions || [])
          .map((item) => ({ label: String(item.label || "").trim() }))
          .filter((item) => item.label);

        setSuggestions(mapped);
        setOpen(mapped.length > 0);
        setActiveIndex(-1);
      } catch {
        // ignore aborted/failed lookups
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectSuggestion = (suggestion: LocationSuggestion) => {
    skipNextFetchRef.current = true;
    setValue(suggestion.label);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        form={formId}
        name={name}
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        placeholder={placeholder}
        className={className}
      />

      {open && suggestions.length > 0 ? (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-white py-1 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)]">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.label}-${index}`}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectSuggestion(suggestion);
                }}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs leading-snug transition hover:bg-muted/60 ${
                  index === activeIndex ? "bg-muted/60" : ""
                }`}
              >
                <span className="mt-0.5 text-muted-foreground">📍</span>
                <span className="text-foreground">{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          …
        </span>
      ) : null}
    </div>
  );
}
