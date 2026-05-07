"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { BetAnswerWithMeta, BetWithMeta } from "@/lib/bets-data";
import {
  deleteBetAction,
  reopenBetAction,
  setBetStatusAction,
  setCorrectAnswerAndScoreAction,
} from "./actions";

type PlayerOpt = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  countryCode: string | null;
  clubShortName: string | null;
};

const STATUS_LABEL = { open: "ÖPPEN", closed: "STÄNGD", scored: "POÄNGSATT" } as const;
const STATUS_COLOR = {
  open: "text-cyan",
  closed: "text-yellow",
  scored: "text-green",
} as const;

export function BetCard({
  meta,
  answers,
}: {
  meta: BetWithMeta;
  answers: BetAnswerWithMeta[];
}) {
  const { bet } = meta;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [correctPlayer, setCorrectPlayer] = useState<string>("");
  const [correctNumeric, setCorrectNumeric] = useState<string>("");

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
      <header className="flex items-baseline justify-between gap-3 text-xs uppercase tracking-widest">
        <span className="truncate">
          <span className="text-yellow">{bet.question}</span>
        </span>
        <span className={STATUS_COLOR[bet.status]}>
          {STATUS_LABEL[bet.status]}
        </span>
      </header>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] tabular-nums sm:grid-cols-4">
        <KV k="TYP" v={bet.answerType === "player_ref" ? "SPELARE" : "SIFFRA"} />
        <KV k="POÄNG" v={bet.pointsValue} />
        <KV k="ROND" v={meta.roundNumber ? `R${meta.roundNumber}` : "—"} />
        <KV k="SVAR" v={meta.answerCount} />
      </dl>

      {bet.status === "scored" && (
        <p className="mt-2 text-xs">
          <span className="text-dim">RÄTT SVAR: </span>
          <span className="text-green">
            {bet.answerType === "player_ref"
              ? meta.correctPlayerName
                ? `${meta.correctPlayerName} (${meta.correctPlayerCountry ?? "—"})`
                : "—"
              : (bet.correctAnswerNumeric ?? "—")}
          </span>
        </p>
      )}

      {bet.status === "closed" && (
        <SetCorrectAnswerForm
          bet={bet}
          correctPlayer={correctPlayer}
          setCorrectPlayer={setCorrectPlayer}
          correctNumeric={correctNumeric}
          setCorrectNumeric={setCorrectNumeric}
          onSubmit={() =>
            run(() =>
              setCorrectAnswerAndScoreAction(
                bet.id,
                bet.answerType === "player_ref"
                  ? correctPlayer || null
                  : null,
                bet.answerType === "numeric"
                  ? correctNumeric === ""
                    ? null
                    : parseInt(correctNumeric, 10)
                  : null,
              ),
            )
          }
          pending={pending}
        />
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
        {bet.status === "open" && (
          <Btn
            label="STÄNG"
            tone="yellow"
            onClick={() => run(() => setBetStatusAction(bet.id, "closed"))}
            disabled={pending}
          />
        )}
        {bet.status === "closed" && (
          <Btn
            label="ÅTERÖPPNA"
            tone="cyan"
            onClick={() => run(() => setBetStatusAction(bet.id, "open"))}
            disabled={pending}
          />
        )}
        {bet.status === "scored" && (
          <Btn
            label="ÅTERSTÄLL"
            tone="dim"
            onClick={() => run(() => reopenBetAction(bet.id))}
            disabled={pending}
          />
        )}
        <Btn
          label="× TA BORT"
          tone="red"
          onClick={() => {
            if (confirm("Ta bort beten? Alla svar försvinner.")) {
              run(() => deleteBetAction(bet.id));
            }
          }}
          disabled={pending}
        />
      </div>

      {error && (
        <p className="mt-3 border border-red bg-red/10 px-3 py-2 text-sm text-red">
          ! {error}
        </p>
      )}

      {answers.length > 0 && (
        <ul className="mt-4 divide-y divide-dotted divide-border/60 border border-border">
          {answers.map((a) => (
            <li
              key={a.id}
              className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 p-2 text-xs"
            >
              <span className="truncate">
                <span className="text-yellow">{a.teamName}</span>{" "}
                <span className="text-dim">{a.ownerHandle}</span>
              </span>
              <span className="text-foreground">
                {bet.answerType === "player_ref"
                  ? a.answerPlayerName
                    ? `${a.answerPlayerName} (${a.answerPlayerCountry ?? "—"})`
                    : "—"
                  : (a.answerNumeric ?? "—")}
              </span>
              <span
                className={
                  a.pointsAwarded > 0 ? "text-green tabular-nums" : "text-dim"
                }
              >
                {a.pointsAwarded > 0 ? `+${a.pointsAwarded}` : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SetCorrectAnswerForm({
  bet,
  correctPlayer,
  setCorrectPlayer,
  correctNumeric,
  setCorrectNumeric,
  onSubmit,
  pending,
}: {
  bet: BetWithMeta["bet"];
  correctPlayer: string;
  setCorrectPlayer: (v: string) => void;
  correctNumeric: string;
  setCorrectNumeric: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <div className="mt-3 border border-yellow/40 bg-yellow/5 p-3">
      <p className="text-[10px] uppercase tracking-widest text-yellow">
        SÄTT RÄTT SVAR
      </p>
      {bet.answerType === "player_ref" ? (
        <PlayerPicker value={correctPlayer} onChange={setCorrectPlayer} />
      ) : (
        <input
          type="number"
          value={correctNumeric}
          onChange={(e) => setCorrectNumeric(e.target.value)}
          className="mt-2 block w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
          placeholder="t.ex. 3"
        />
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={
          pending ||
          (bet.answerType === "player_ref"
            ? correctPlayer === ""
            : correctNumeric === "")
        }
        className="mt-3 border border-green px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-green transition hover:bg-green hover:text-black disabled:opacity-40"
      >
        [ SPARA & POÄNGSÄTT ]
      </button>
    </div>
  );
}

export function PlayerPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [players, setPlayers] = useState<PlayerOpt[]>([]);
  const [country, setCountry] = useState<string>("ALL");

  useEffect(() => {
    fetch("/api/players/list")
      .then((r) => r.json())
      .then((data: PlayerOpt[]) => setPlayers(data))
      .catch(() => setPlayers([]));
  }, []);

  const countries = useMemo(() => {
    const s = new Set<string>();
    for (const p of players) if (p.countryCode) s.add(p.countryCode);
    return Array.from(s).sort();
  }, [players]);

  const filtered = useMemo(() => {
    if (country === "ALL") return players;
    return players.filter((p) => p.countryCode === country);
  }, [players, country]);

  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <select
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className="border border-border bg-transparent px-2 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
      >
        <option value="ALL">ALLA LAG</option>
        {countries.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-border bg-transparent px-2 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
      >
        <option value="">— välj spelare —</option>
        {filtered.map((p) => (
          <option key={p.id} value={p.id}>
            {p.position} {p.name} ({p.countryCode ?? "—"})
          </option>
        ))}
      </select>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string | number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-dim">{k}</dt>
      <dd className="text-foreground">{v}</dd>
    </div>
  );
}

function Btn({
  label,
  tone,
  onClick,
  disabled,
}: {
  label: string;
  tone: "cyan" | "yellow" | "green" | "red" | "dim";
  onClick: () => void;
  disabled: boolean;
}) {
  const colorByTone: Record<typeof tone, string> = {
    cyan: "border-cyan text-cyan hover:bg-cyan hover:text-black",
    yellow: "border-yellow text-yellow hover:bg-yellow hover:text-black",
    green: "border-green text-green hover:bg-green hover:text-black",
    red: "border-red text-red hover:bg-red hover:text-black",
    dim: "border-border text-dim hover:border-cyan hover:text-cyan",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`border px-3 py-1.5 font-bold uppercase tracking-widest transition disabled:opacity-40 ${colorByTone[tone]}`}
    >
      [ {label} ]
    </button>
  );
}
