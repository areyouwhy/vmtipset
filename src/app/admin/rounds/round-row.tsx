"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { RoundStatus } from "@/db/schema";
import type { ScoringSummary } from "@/lib/score-runner";
import { formatStockholm } from "@/lib/format-time";
import { teamSlug } from "@/lib/team-slug";
import {
  lockRoundAction,
  openRoundAction,
  reopenRoundAction,
  scoreRoundAction,
} from "./actions";

const STATUS_LABEL: Record<RoundStatus, string> = {
  upcoming: "KOMMANDE",
  open: "ÖPPEN",
  locked: "LÅST",
  scored: "POÄNGSATT",
};

const STATUS_COLOR: Record<RoundStatus, string> = {
  upcoming: "text-dim",
  open: "text-cyan",
  locked: "text-yellow",
  scored: "text-green",
};

export function RoundRow({
  roundId,
  number,
  name,
  status,
  deadline,
  squadCount,
  scoreCount,
}: {
  roundId: string;
  number: number;
  name: string;
  status: RoundStatus;
  deadline: Date | null;
  squadCount: number;
  scoreCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<ScoringSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run<T>(fn: () => Promise<T>, onResult?: (r: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (onResult) onResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Okänt fel");
      }
    });
  }

  return (
    <li className="border border-border p-4">
      <header className="flex items-baseline justify-between gap-3 text-xs uppercase tracking-widest">
        <span>
          <span className="text-dim">ROND </span>
          <span className="text-yellow tabular-nums">
            {String(number).padStart(2, "0")}
          </span>{" "}
          <span className="text-foreground">— {name}</span>
        </span>
        <span className={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</span>
      </header>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px] tabular-nums">
        <Stat
          k="DEADLINE"
          v={deadline ? formatStockholm(deadline) : "—"}
        />
        <Stat k="TRUPPER" v={squadCount} />
        <Stat
          k="POÄNG"
          v={`${scoreCount}/${squadCount}`}
        />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {status === "upcoming" && (
          <ActionButton
            label="ÖPPNA"
            onClick={() => run(() => openRoundAction(roundId))}
            disabled={pending}
            tone="cyan"
          />
        )}
        {status === "open" && (
          <>
            <ActionButton
              label="LÅS"
              onClick={() => run(() => lockRoundAction(roundId))}
              disabled={pending}
              tone="yellow"
            />
            <ActionButton
              label="LÅS & POÄNGSÄTT"
              onClick={() =>
                run(
                  () => scoreRoundAction(roundId),
                  (s) => setSummary(s),
                )
              }
              disabled={pending}
              tone="green"
            />
          </>
        )}
        {status === "locked" && (
          <>
            <ActionButton
              label="POÄNGSÄTT"
              onClick={() =>
                run(
                  () => scoreRoundAction(roundId),
                  (s) => setSummary(s),
                )
              }
              disabled={pending}
              tone="green"
            />
            <ActionButton
              label="ÖPPNA IGEN"
              onClick={() => run(() => openRoundAction(roundId))}
              disabled={pending}
              tone="dim"
            />
          </>
        )}
        {status === "scored" && (
          <>
            <ActionButton
              label="KÖR OM POÄNG"
              onClick={() =>
                run(
                  () => scoreRoundAction(roundId),
                  (s) => setSummary(s),
                )
              }
              disabled={pending}
              tone="yellow"
            />
            <ActionButton
              label="ÅTERSTÄLL"
              onClick={() => run(() => reopenRoundAction(roundId))}
              disabled={pending}
              tone="dim"
            />
          </>
        )}
      </div>

      {error && (
        <p className="mt-3 border border-red bg-red/10 px-3 py-2 text-sm text-red">
          ! {error}
        </p>
      )}

      {summary && (
        <div className="mt-4 border border-green bg-green/5 p-3">
          <p className="text-[10px] uppercase tracking-widest text-green">
            ✓ POÄNGSATT — {summary.teamsScored} LAG
          </p>
          {summary.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-yellow">
              {summary.warnings.map((w, i) => (
                <li key={i}>! {w}</li>
              ))}
            </ul>
          )}
          {summary.results.length > 0 && (
            <table className="mt-3 w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-widest text-dim">
                  <th className="py-1 text-left">#</th>
                  <th className="py-1 text-left">LAG</th>
                  <th className="py-1 text-right">TILLVÄXT</th>
                  <th className="py-1 text-right">© BONUS</th>
                  <th className="py-1 text-right">BANK</th>
                  <th className="py-1 text-right">AVGIFT</th>
                  <th className="py-1 text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {summary.results.slice(0, 10).map((r, i) => (
                  <tr key={r.teamId} className="border-b border-dotted border-border/60">
                    <td className="py-1 text-dim">{i + 1}</td>
                    <td className="py-1 text-foreground">
                      <Link
                        href={`/team/${teamSlug(r.teamName)}`}
                        className="hover:text-cyan"
                      >
                        {r.teamName}
                      </Link>
                    </td>
                    <td className="py-1 text-right">
                      {fmt(r.sumGrowthSek)}
                    </td>
                    <td className="py-1 text-right">
                      {fmt(r.captainBonusSek)}
                    </td>
                    <td className="py-1 text-right">
                      {fmt(r.bankInterestSek)}
                    </td>
                    <td className="py-1 text-right text-red">
                      {r.transferFeesSek > 0 ? `−${fmt(r.transferFeesSek)}` : "—"}
                    </td>
                    <td className="py-1 text-right text-yellow">
                      {fmt(r.totalPointsSek)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-dim">{k}</dt>
      <dd className="mt-0.5 text-foreground">{v}</dd>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone: "cyan" | "yellow" | "green" | "dim";
}) {
  const colorByTone: Record<typeof tone, string> = {
    cyan: "border-cyan text-cyan hover:bg-cyan hover:text-black",
    yellow: "border-yellow text-yellow hover:bg-yellow hover:text-black",
    green: "border-green text-green hover:bg-green hover:text-black",
    dim: "border-border text-dim hover:border-cyan hover:text-cyan",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition disabled:opacity-40 ${colorByTone[tone]}`}
    >
      [ {label} ]
    </button>
  );
}

function fmt(n: number): string {
  // Compact SEK display: "+250k", "1.2M", "-100k"
  const absN = Math.abs(n);
  if (absN >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (absN >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}
