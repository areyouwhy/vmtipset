"use client";

import { useActionState } from "react";
import { createSideBetAction } from "./actions";

export function CreateSideBetForm() {
  const [state, formAction, pending] = useActionState(createSideBetAction, null);
  return (
    <form action={formAction} className="mt-3 space-y-3">
      <textarea
        name="question"
        required
        maxLength={500}
        rows={2}
        className="block w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
        placeholder="t.ex. Vem dricker först en öl efter Sveriges första mål?"
      />
      {state?.errors && state.errors.length > 0 && (
        <ul className="border border-red bg-red/10 px-3 py-2 text-sm text-red">
          {state.errors.map((e, i) => (
            <li key={i}>! {e}</li>
          ))}
        </ul>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full border border-yellow bg-yellow px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90 disabled:opacity-40 sm:w-auto"
      >
        {pending ? "[ SKAPAR... ]" : "[ SKAPA SIDOSPEL → ]"}
      </button>
    </form>
  );
}
