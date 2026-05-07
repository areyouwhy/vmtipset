"use client";

import { useState, useTransition } from "react";
import type { SideBet } from "@/db/schema";
import { deleteSideBetAction, setResolutionAction } from "./actions";

export function SideBetCard({ bet }: { bet: SideBet }) {
  const [resolution, setResolution] = useState(bet.resolution ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<T>(fn: () => Promise<T>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fel");
      }
    });
  }

  return (
    <div className="border border-border p-4">
      <p className="text-yellow">{bet.question}</p>

      <div className="mt-3">
        <label className="block text-[10px] uppercase tracking-widest text-dim">
          RESULTAT (FRI TEXT)
        </label>
        <textarea
          rows={2}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          className="mt-1 block w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
          placeholder="Lämna tomt om inte avgjort. Spara för att publicera."
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
        <button
          type="button"
          onClick={() =>
            run(() => setResolutionAction(bet.id, resolution || null))
          }
          disabled={pending}
          className="border border-green px-3 py-1.5 font-bold uppercase tracking-widest text-green transition hover:bg-green hover:text-black disabled:opacity-40"
        >
          [ SPARA RESULTAT ]
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("Ta bort sidospelet?")) {
              run(() => deleteSideBetAction(bet.id));
            }
          }}
          disabled={pending}
          className="border border-red px-3 py-1.5 font-bold uppercase tracking-widest text-red transition hover:bg-red hover:text-black disabled:opacity-40"
        >
          [ × TA BORT ]
        </button>
      </div>

      {error && (
        <p className="mt-3 border border-red bg-red/10 px-3 py-2 text-xs text-red">
          ! {error}
        </p>
      )}
    </div>
  );
}
