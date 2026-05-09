"use client";

import { useState, useTransition } from "react";
import { scoreAllPastRoundsAction } from "./actions";

export function FastForwardButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    scoredRoundCount: number;
    totalTeamsScored: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mb-6 border border-cyan/30 bg-cyan/5 p-4">
      <p className="text-[10px] uppercase tracking-widest text-cyan">
        SNABBSPOLA
      </p>
      <p className="mt-1 text-sm text-dim">
        Markera alla ronder vars deadline redan passerat som POÄNGSATTA. Bra
        för PL-data där säsongen redan kommit halvvägs när du kopplar in den.
        Idempotent — gör inget om det redan är gjort.
      </p>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setResult(null);
          startTransition(async () => {
            try {
              setResult(await scoreAllPastRoundsAction());
            } catch (e) {
              setError(e instanceof Error ? e.message : "Fel");
            }
          });
        }}
        disabled={pending}
        className="mt-3 border border-cyan px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan transition hover:bg-cyan hover:text-black disabled:opacity-40"
      >
        {pending ? "[ KÖR... ]" : "[ POÄNGSÄTT ALLA PASSERADE ]"}
      </button>
      {error && (
        <p className="mt-3 border border-red bg-red/10 px-3 py-2 text-xs text-red">
          ! {error}
        </p>
      )}
      {result && (
        <p className="mt-3 text-xs text-green">
          ✓ {result.scoredRoundCount} ronder poängsatta · {result.totalTeamsScored} lag fick poäng
        </p>
      )}
    </section>
  );
}
