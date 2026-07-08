"use client";
// components/SearchableSelect.tsx
// A dark-theme dropdown that is scrollable + searchable, with clearly visible
// hover/selection (white text on green). Replaces the native <select> whose
// option hover rendered dark-on-dark (invisible).

import { useEffect, useRef, useState } from "react";

export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  searchable = true,
  placeholder = "Search…",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  searchable?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div ref={boxRef} className="relative">
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-glassBorder bg-glass px-3 py-2.5 text-left text-sm text-paper outline-none transition hover:border-wtgreen focus:border-wtgreen"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{value || placeholder}</span>
        <span className={`ml-2 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-glassBorder shadow-2xl ring-1 ring-black/40"
          style={{ backgroundColor: "#0b100e" }}
        >
          {searchable && (
            <div className="border-b border-white/10 p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-paper placeholder:text-muted outline-none focus:border-wtgreen"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted">No matches</li>
            )}
            {filtered.map((o) => {
              const selected = o === value;
              return (
                <li key={o}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => { onChange(o); setOpen(false); setQuery(""); }}
                    className={`block w-full px-3 py-2 text-left text-sm transition
                      ${selected
                        ? "bg-wtgreen font-semibold text-white"
                        : "text-paper hover:bg-wtgreen hover:text-white"}`}
                  >
                    {o}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
