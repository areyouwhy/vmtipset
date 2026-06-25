"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { RivalryAccent } from "@/lib/rivalries";
import type { VoteSummary } from "@/lib/rivalry-votes";
import { castVote } from "./vote-actions";

const SOLID: Record<RivalryAccent, string> = {
  cyan: "bg-cyan",
  yellow: "bg-yellow",
  green: "bg-green",
  red: "bg-red",
  magenta: "bg-magenta",
};

const TEXT: Record<RivalryAccent, string> = {
  cyan: "text-cyan",
  yellow: "text-yellow",
  green: "text-green",
  red: "text-red",
  magenta: "text-magenta",
};

export type VoteSide = { key: string; label: string; accent: RivalryAccent };

export function VotePanel({
  rivalrySlug,
  sides,
  summary,
  myVote,
  signedIn,
}: {
  rivalrySlug: string;
  sides: VoteSide[];
  summary: VoteSummary;
  myVote: string | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<string | null>(myVote);
  const [pending, startTransition] = useTransition();

  const choice = optimistic;
  const reveal = choice != null; // anti-bandwagon: results show only after voting

  // Counts shown reflect the optimistic pick until the server refresh lands and
  // the props catch up (at which point optimistic === myVote → no adjustment).
  const display = useMemo(() => {
    const bySide: Record<string, number> = { ...summary.bySide };
    let total = summary.total;
    if (optimistic !== myVote) {
      if (myVote) bySide[myVote] = Math.max(0, (bySide[myVote] ?? 1) - 1);
      if (optimistic) {
        bySide[optimistic] = (bySide[optimistic] ?? 0) + 1;
        if (!myVote) total += 1;
      } else if (myVote) {
        total = Math.max(0, total - 1);
      }
    }
    return { bySide, total };
  }, [summary, optimistic, myVote]);

  function choose(sideKey: string) {
    if (!signedIn) {
      router.push(
        `/sign-in?redirect_url=${encodeURIComponent(`/hets/${rivalrySlug}`)}`,
      );
      return;
    }
    if (optimistic === sideKey || pending) return;
    const prev = optimistic;
    setOptimistic(sideKey);
    startTransition(async () => {
      const res = await castVote(rivalrySlug, sideKey);
      if (res.ok) router.refresh();
      else setOptimistic(prev);
    });
  }

  return (
    <section className="mt-6 border border-magenta/40 bg-magenta/5">
      <header className="border-b border-magenta/40 px-3 py-2 text-[10px] uppercase tracking-widest text-magenta">
        VEM VINNER? · RÖSTNING
      </header>

      <div
        className={`grid gap-2 p-3 ${
          sides.length === 3 ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        {sides.map((s) => {
          const selected = choice === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => choose(s.key)}
              disabled={pending}
              aria-pressed={selected}
              className={`border px-3 py-3 text-center text-xs uppercase tracking-widest transition disabled:opacity-60 ${
                selected
                  ? `${SOLID[s.accent]} border-transparent text-black`
                  : `border-border ${TEXT[s.accent]} hover:bg-foreground/5`
              }`}
            >
              {s.label}
              {selected && " ✓"}
            </button>
          );
        })}
      </div>

      {reveal ? (
        <div className="border-t border-border px-3 py-3">
          <div className="flex h-5 w-full overflow-hidden border border-border">
            {sides.map((s) => {
              const pct = display.total
                ? Math.round(((display.bySide[s.key] ?? 0) / display.total) * 100)
                : 0;
              return (
                <div
                  key={s.key}
                  className={`${SOLID[s.accent]} h-full transition-all`}
                  style={{ width: `${pct}%` }}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] uppercase tracking-widest">
            {sides.map((s) => {
              const pct = display.total
                ? Math.round(((display.bySide[s.key] ?? 0) / display.total) * 100)
                : 0;
              return (
                <span key={s.key} className={TEXT[s.accent]}>
                  {s.label} {pct}%
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-dim">
            {display.total} {display.total === 1 ? "röst" : "röster"} · klicka för
            att byta
          </p>
        </div>
      ) : (
        <p className="border-t border-border px-3 py-2 text-[10px] uppercase tracking-widest text-dim">
          {signedIn
            ? "Rösta för att se hur de andra röstat."
            : "Logga in för att rösta."}
        </p>
      )}
    </section>
  );
}
