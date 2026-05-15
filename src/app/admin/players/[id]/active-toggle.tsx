"use client";

import { useTransition } from "react";
import { setPlayerActiveAction } from "./actions";

export function ActiveToggle({
  playerId,
  active,
}: {
  playerId: string;
  active: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        start(async () => {
          await setPlayerActiveAction({ playerId, active: !active });
        })
      }
      disabled={pending}
      className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition disabled:opacity-50 ${
        active
          ? "border-green text-green hover:bg-red/10 hover:border-red hover:text-red"
          : "border-red text-red hover:bg-green/10 hover:border-green hover:text-green"
      }`}
    >
      {pending
        ? "…"
        : active
          ? "[ AKTIV — KLICKA FÖR ATT INAKTIVERA ]"
          : "[ INAKTIV — KLICKA FÖR ATT ÅTERAKTIVERA ]"}
    </button>
  );
}
