"use client";

import { useState, useTransition } from "react";
import type { PrizePoolKey } from "@/db/schema";
import { savePoolPlacesAction } from "./actions";

type Row = { place: number; sharePct: number };

export function PlacesEditor({
  poolKey,
  poolLabel,
  initialPlaces,
}: {
  poolKey: PrizePoolKey;
  poolLabel: string;
  initialPlaces: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initialPlaces);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const [ok, setOk] = useState(false);

  const total = rows.reduce((acc, r) => acc + (r.sharePct || 0), 0);

  function updateRow(i: number, sharePct: number) {
    setOk(false);
    setRows((rs) =>
      rs.map((r, idx) => (idx === i ? { ...r, sharePct } : r)),
    );
  }

  function addRow() {
    setOk(false);
    setRows((rs) => [...rs, { place: rs.length + 1, sharePct: 0 }]);
  }

  function removeRow(i: number) {
    setOk(false);
    setRows((rs) =>
      rs
        .filter((_, idx) => idx !== i)
        .map((r, idx) => ({ ...r, place: idx + 1 })),
    );
  }

  function save() {
    setErrors([]);
    setOk(false);
    startTransition(async () => {
      const result = await savePoolPlacesAction(poolKey, rows);
      if (result.ok) {
        setOk(true);
      } else {
        setErrors(result.errors);
      }
    });
  }

  return (
    <div className="border border-border p-5">
      <p className="text-[10px] uppercase tracking-widest text-dim">
        PLATSER · {poolLabel}
      </p>
      <h2 className="mt-2 text-xl font-bold uppercase tracking-tight text-yellow">
        VINSTFÖRDELNING
      </h2>
      <p className="mt-2 text-xs text-dim">
        Andel av <span className="text-foreground">{poolLabel}</span>-potten per
        placering. Måste summera till 100.
      </p>

      <ul className="mt-5 space-y-2">
        {rows.map((row, i) => (
          <li
            key={i}
            className="grid grid-cols-[3rem_1fr_auto_auto] items-baseline gap-3"
          >
            <span className="text-xs uppercase tracking-widest text-dim">
              P{row.place}
            </span>
            <span />
            <div className="flex items-baseline gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={row.sharePct}
                onChange={(e) => updateRow(i, parseFloat(e.target.value) || 0)}
                className="w-24 border border-border bg-transparent px-2 py-1 text-right text-base tabular-nums text-foreground focus:border-yellow focus:outline-none"
              />
              <span className="text-dim">%</span>
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-dim transition hover:border-red hover:text-red"
              aria-label={`Ta bort plats ${row.place}`}
            >
              [ × ]
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-baseline justify-between text-xs">
        <button
          type="button"
          onClick={addRow}
          className="border border-border px-3 py-1.5 uppercase tracking-widest text-dim transition hover:border-cyan hover:text-cyan"
        >
          [ + LÄGG TILL PLATS ]
        </button>
        <p className="tabular-nums text-dim">
          SUMMA:{" "}
          <span className={total === 100 ? "text-green" : "text-red"}>
            {total.toFixed(2)}%
          </span>
        </p>
      </div>

      {errors.length > 0 && (
        <ul className="mt-4 space-y-1 border border-red bg-red/10 px-3 py-2 text-sm text-red">
          {errors.map((e, i) => (
            <li key={i}>! {e}</li>
          ))}
        </ul>
      )}
      {ok && (
        <p className="mt-4 border border-green bg-green/10 px-3 py-2 text-sm text-green">
          ✓ SPARAT
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-5 w-full border border-yellow bg-yellow px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90 disabled:opacity-40 sm:w-auto"
      >
        {pending ? "[ SPARAR... ]" : "[ SPARA PLATSER ]"}
      </button>
    </div>
  );
}
