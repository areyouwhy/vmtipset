"use client";

import { useActionState } from "react";
import { createTeamAction } from "./actions";

export function CreateTeamForm() {
  const [state, formAction, pending] = useActionState(createTeamAction, null);

  return (
    <section className="border border-border p-5">
      <p className="text-[10px] uppercase tracking-widest text-dim">
        STEG 1 / 2 — TEAM
      </p>
      <h2 className="mt-2 text-xl font-bold uppercase tracking-tight text-yellow">
        SKAPA DITT LAG
      </h2>
      <p className="mt-3 text-sm text-dim">
        Välj ett lagnamn. Detaljerna kan justeras när det är dags att bygga
        laget.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-[10px] uppercase tracking-widest text-dim"
          >
            LAGNAMN
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={40}
            autoComplete="off"
            className="mt-1 block w-full border border-border bg-transparent px-3 py-2 text-base text-foreground placeholder:text-dim focus:border-yellow focus:outline-none"
            placeholder="t.ex. LOS CABALLEROS"
          />
        </div>

        {state?.error && (
          <p className="border border-red bg-red/10 px-3 py-2 text-sm text-red">
            ! {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full border border-yellow bg-yellow px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "[ SKAPAR... ]" : "[ SKAPA LAG → ]"}
        </button>
      </form>
    </section>
  );
}
