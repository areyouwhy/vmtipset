"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Jersey } from "@/lib/jersey";

/**
 * Chip row used by the squad picker + /spelare. One row of compact
 * selectable values (e.g. positions, sort keys) with the selected one
 * highlighted yellow. Falls back to horizontal scroll on narrow viewports.
 */
export function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-widest text-dim">
        {label}
      </p>
      <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`shrink-0 snap-start border px-3 py-1.5 text-[10px] uppercase tracking-widest transition ${
              value === opt.value
                ? "border-yellow bg-yellow text-black"
                : "border-border text-dim hover:border-cyan hover:text-cyan"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Country combo-box: a button that opens a searchable dropdown of all
 * teams with their jerseys. "ALL" represents the no-filter state.
 * Used by the squad picker and /spelare to filter by nation.
 */
export function TeamComboBox({
  teams,
  value,
  onChange,
  label = "LAG",
}: {
  teams: { code: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q),
    );
  }, [teams, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const selectedLabel =
    value === "ALL"
      ? "ALLA LAG"
      : (() => {
          const t = teams.find((x) => x.code === value);
          return t ? `${t.code} · ${t.name.toUpperCase()}` : value;
        })();

  function pick(v: string) {
    onChange(v);
    close();
  }

  return (
    <div ref={rootRef} className="relative">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-dim">{label}</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 border px-3 py-2 text-left text-xs uppercase tracking-widest transition ${
          value === "ALL"
            ? "border-border text-dim hover:border-cyan hover:text-cyan"
            : "border-yellow text-yellow"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {value !== "ALL" && <Jersey code={value} size={20} />}
          <span className="truncate">{selectedLabel}</span>
        </span>
        <span aria-hidden="true" className="text-[10px]">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Välj lag"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-hidden border border-yellow bg-background shadow-lg"
        >
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SÖK LAND (T.EX. ARG, BRASILIEN)"
              className="w-full border border-border bg-background px-2 py-1.5 text-xs uppercase tracking-widest text-foreground placeholder:text-dim focus:border-cyan focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => pick("ALL")}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-xs uppercase tracking-widest transition hover:bg-yellow/10 ${
                  value === "ALL" ? "bg-yellow/15 text-yellow" : "text-foreground"
                }`}
              >
                <span>ALLA LAG</span>
                <span className="text-[10px] text-dim tabular-nums">
                  {teams.length}
                </span>
              </button>
            </li>
            {matches.map((t) => {
              const active = value === t.code;
              return (
                <li key={t.code}>
                  <button
                    type="button"
                    onClick={() => pick(t.code)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs uppercase tracking-widest transition hover:bg-yellow/10 ${
                      active ? "bg-yellow/15 text-yellow" : "text-foreground"
                    }`}
                  >
                    <Jersey code={t.code} size={24} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-yellow tabular-nums">{t.code}</span>{" "}
                      <span className={active ? "text-yellow" : "text-dim"}>
                        · {t.name}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {matches.length === 0 && (
              <li className="px-3 py-3 text-center text-xs text-dim">
                — inga matcher —
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
