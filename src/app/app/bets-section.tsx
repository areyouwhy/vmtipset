"use client";

import { useState, useTransition } from "react";
import type { BetWithMeta } from "@/lib/bets-data";
import type { BetAnswer } from "@/db/schema";
import { PlayerPicker } from "@/app/admin/bets/bet-card";
import { submitBetAnswerAction } from "./bets/actions";
import { formatStockholm } from "@/lib/format-time";

export function BetsSection({
  bets,
  myAnswers,
}: {
  bets: BetWithMeta[];
  myAnswers: { betId: string; answer: BetAnswer }[];
}) {
  const myByBet = new Map(myAnswers.map((a) => [a.betId, a.answer]));
  if (bets.length === 0) {
    return (
      <section className="border border-border p-4 text-sm text-dim">
        Inga öppna bet just nu.
      </section>
    );
  }
  return (
    <section className="border border-border p-4">
      <p className="text-[10px] uppercase tracking-widest text-yellow">
        DAGENS BET
      </p>
      <h2 className="mt-1 text-lg font-bold uppercase tracking-tight text-foreground">
        ÖPPNA FRÅGOR ({bets.length})
      </h2>
      <ul className="mt-3 space-y-3">
        {bets.map((b) => (
          <li key={b.bet.id} className="border border-border p-3">
            <BetAnswerRow
              meta={b}
              previousAnswer={myByBet.get(b.bet.id) ?? null}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BetAnswerRow({
  meta,
  previousAnswer,
}: {
  meta: BetWithMeta;
  previousAnswer: BetAnswer | null;
}) {
  const { bet } = meta;
  const [playerId, setPlayerId] = useState<string>(
    previousAnswer?.answerPlayerId ?? "",
  );
  const [numeric, setNumeric] = useState<string>(
    previousAnswer?.answerNumeric != null
      ? String(previousAnswer.answerNumeric)
      : "",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function submit() {
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const r = await submitBetAnswerAction({
        betId: bet.id,
        answerPlayerId: bet.answerType === "player_ref" ? playerId || null : null,
        answerNumeric:
          bet.answerType === "numeric"
            ? numeric === ""
              ? null
              : parseInt(numeric, 10)
            : null,
      });
      if (r.ok) setSavedAt(Date.now());
      else setError(r.error ?? "Fel");
    });
  }

  return (
    <div>
      <p className="text-sm text-yellow">{bet.question}</p>
      <p className="mt-1 text-[10px] uppercase tracking-widest text-dim">
        TYP {bet.answerType === "player_ref" ? "SPELARE" : "SIFFRA"} · POÄNG{" "}
        {bet.pointsValue}
        {bet.deadline && (
          <>
            {" "}
            · DEADLINE{" "}
            {formatStockholm(bet.deadline)}
          </>
        )}
      </p>

      {bet.answerType === "player_ref" ? (
        <PlayerPicker value={playerId} onChange={setPlayerId} />
      ) : (
        <input
          type="number"
          value={numeric}
          onChange={(e) => setNumeric(e.target.value)}
          className="mt-2 block w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
          placeholder="Ditt svar"
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={
            pending ||
            (bet.answerType === "player_ref"
              ? playerId === ""
              : numeric === "")
          }
          className="border border-yellow bg-yellow px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-black transition hover:opacity-90 disabled:opacity-40"
        >
          {pending
            ? "[ SPARAR... ]"
            : previousAnswer
              ? "[ UPPDATERA SVAR ]"
              : "[ SVARA ]"}
        </button>
        {previousAnswer && !savedAt && (
          <span className="text-[10px] uppercase tracking-widest text-dim">
            DITT SVAR ÄR REGISTRERAT
          </span>
        )}
        {savedAt && (
          <span className="text-[10px] uppercase tracking-widest text-green">
            ✓ SPARAT
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 border border-red bg-red/10 px-3 py-2 text-xs text-red">
          ! {error}
        </p>
      )}
    </div>
  );
}
