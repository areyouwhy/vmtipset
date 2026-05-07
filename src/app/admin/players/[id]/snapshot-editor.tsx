"use client";

import { useState, useTransition } from "react";
import {
  deleteManualSnapshotAction,
  upsertManualSnapshotAction,
} from "./actions";

export function SnapshotEditor({
  playerId,
  roundId,
  defaults,
  hasManual,
}: {
  playerId: string;
  roundId: string;
  defaults: { priceSek: number; growthSek: number; notes: string };
  hasManual: boolean;
}) {
  const [priceM, setPriceM] = useState(
    (defaults.priceSek / 1_000_000).toFixed(2),
  );
  const [growthK, setGrowthK] = useState(
    (defaults.growthSek / 1_000).toFixed(0),
  );
  const [notes, setNotes] = useState(defaults.notes);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function run<T>(fn: () => Promise<T>) {
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      try {
        await fn();
        setSavedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fel");
      }
    });
  }

  function save() {
    const priceSek = Math.round(parseFloat(priceM) * 1_000_000);
    const growthSek = Math.round(parseFloat(growthK) * 1_000);
    if (Number.isNaN(priceSek) || Number.isNaN(growthSek)) {
      setError("Ogiltiga värden.");
      return;
    }
    run(() =>
      upsertManualSnapshotAction({
        playerId,
        roundId,
        priceSek,
        growthSek,
        notes: notes.trim() || null,
      }),
    );
  }

  function clear() {
    if (!confirm("Ta bort manuell override?")) return;
    run(() =>
      deleteManualSnapshotAction({
        playerId,
        roundId,
      }),
    );
  }

  return (
    <div className="mt-3 border border-yellow/30 bg-yellow/5 p-3">
      <p className="text-[10px] uppercase tracking-widest text-yellow">
        MANUAL OVERRIDE
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-dim">
            PRIS (M SEK)
          </span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={priceM}
            onChange={(e) => setPriceM(e.target.value)}
            className="mt-1 block w-full border border-border bg-transparent px-2 py-1.5 text-foreground focus:border-yellow focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-dim">
            TILLVÄXT (k SEK)
          </span>
          <input
            type="number"
            step="50"
            value={growthK}
            onChange={(e) => setGrowthK(e.target.value)}
            className="mt-1 block w-full border border-border bg-transparent px-2 py-1.5 text-foreground focus:border-yellow focus:outline-none"
          />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-[10px] uppercase tracking-widest text-dim">
          ANTECKNING (VAL.)
        </span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={200}
          className="mt-1 block w-full border border-border bg-transparent px-2 py-1.5 text-sm text-foreground focus:border-yellow focus:outline-none"
          placeholder="t.ex. korrigerat efter Aftonbladet uppdatering"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="border border-yellow bg-yellow px-3 py-1.5 font-bold uppercase tracking-widest text-black transition hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "[ SPARAR... ]" : "[ SPARA OVERRIDE ]"}
        </button>
        {hasManual && (
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            className="border border-red px-3 py-1.5 font-bold uppercase tracking-widest text-red transition hover:bg-red hover:text-black disabled:opacity-40"
          >
            [ × TA BORT MANUAL ]
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 border border-red bg-red/10 px-3 py-2 text-xs text-red">
          ! {error}
        </p>
      )}
      {savedAt && (
        <p className="mt-3 border border-green bg-green/10 px-3 py-2 text-xs text-green">
          ✓ SPARAT
        </p>
      )}
    </div>
  );
}
