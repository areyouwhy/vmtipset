"use client";

import { useActionState } from "react";
import type { PrizePoolInput } from "@/lib/prizes";
import { savePoolAllocationsAction } from "./actions";

export function PoolAllocationsForm({ pools }: { pools: PrizePoolInput[] }) {
  const [state, formAction, pending] = useActionState(
    savePoolAllocationsAction,
    null,
  );

  return (
    <form action={formAction} className="border border-border p-5">
      <p className="text-[10px] uppercase tracking-widest text-dim">
        POTT-FÖRDELNING
      </p>
      <h2 className="mt-2 text-xl font-bold uppercase tracking-tight text-yellow">
        ALLOKERING PER LÄGE
      </h2>
      <p className="mt-2 text-xs text-dim">
        Andel av total pott till respektive spelläge. Måste summera till 100.
      </p>

      <div className="mt-5 space-y-3">
        {pools.map((pool) => (
          <div key={pool.key} className="grid grid-cols-[1fr_auto] items-baseline gap-3">
            <label
              htmlFor={`alloc_${pool.key}`}
              className="text-xs uppercase tracking-widest text-dim"
            >
              {pool.label}
            </label>
            <div className="flex items-baseline gap-2">
              <input
                id={`alloc_${pool.key}`}
                name={`alloc_${pool.key}`}
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                defaultValue={(pool.allocationBps / 100).toString()}
                className="w-24 border border-border bg-transparent px-2 py-1 text-right text-base tabular-nums text-foreground focus:border-yellow focus:outline-none"
              />
              <span className="text-dim">%</span>
            </div>
          </div>
        ))}
      </div>

      {state?.errors && state.errors.length > 0 && (
        <ul className="mt-4 space-y-1 border border-red bg-red/10 px-3 py-2 text-sm text-red">
          {state.errors.map((e, i) => (
            <li key={i}>! {e}</li>
          ))}
        </ul>
      )}

      {state?.ok && (
        <p className="mt-4 border border-green bg-green/10 px-3 py-2 text-sm text-green">
          ✓ SPARAT
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full border border-yellow bg-yellow px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90 disabled:opacity-40 sm:w-auto"
      >
        {pending ? "[ SPARAR... ]" : "[ SPARA ALLOKERING ]"}
      </button>
    </form>
  );
}
