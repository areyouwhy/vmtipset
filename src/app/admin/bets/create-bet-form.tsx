"use client";

import { useActionState } from "react";
import { createBetAction } from "./actions";

export function CreateBetForm({
  rounds,
}: {
  rounds: { id: string; number: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createBetAction, null);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div>
        <label className="block text-[10px] uppercase tracking-widest text-dim">
          FRÅGA
        </label>
        <input
          name="question"
          type="text"
          required
          maxLength={200}
          className="mt-1 block w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
          placeholder="t.ex. Vem gör första målet i BRA vs ARG?"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-dim">
            SVARSTYP
          </label>
          <select
            name="answerType"
            defaultValue="player_ref"
            className="mt-1 block w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
          >
            <option value="player_ref">Spelare</option>
            <option value="numeric">Siffra</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-dim">
            POÄNG
          </label>
          <input
            name="pointsValue"
            type="number"
            min="1"
            max="10000"
            defaultValue="100"
            required
            className="mt-1 block w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-dim">
            ROND (VAL.)
          </label>
          <select
            name="roundId"
            defaultValue=""
            className="mt-1 block w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
          >
            <option value="">— ingen —</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                R{r.number} · {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-dim">
            DEADLINE (VAL.)
          </label>
          <input
            name="deadline"
            type="datetime-local"
            className="mt-1 block w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
          />
        </div>
      </div>

      {state?.errors && state.errors.length > 0 && (
        <ul className="border border-red bg-red/10 px-3 py-2 text-sm text-red">
          {state.errors.map((e, i) => (
            <li key={i}>! {e}</li>
          ))}
        </ul>
      )}
      {state?.ok && (
        <p className="border border-green bg-green/10 px-3 py-2 text-sm text-green">
          ✓ SKAPAT
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full border border-yellow bg-yellow px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90 disabled:opacity-40 sm:w-auto"
      >
        {pending ? "[ SKAPAR... ]" : "[ SKAPA BET → ]"}
      </button>
    </form>
  );
}
