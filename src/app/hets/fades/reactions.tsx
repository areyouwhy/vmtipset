"use client";

import { useState, useTransition } from "react";
import { FADES_EMOJIS } from "@/lib/reactions-emojis";
import { toggleReaction } from "./react-actions";

export function ReactionBar({
  targetKey,
  counts: initialCounts,
  mine: initialMine,
  signedIn,
}: {
  targetKey: string;
  counts: Record<string, number>;
  mine: string[];
  signedIn: boolean;
}) {
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);
  const [mine, setMine] = useState<Set<string>>(new Set(initialMine));
  const [hint, setHint] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onClick(emoji: string) {
    if (!signedIn) {
      setHint("Logga in för att reagera.");
      return;
    }
    const wasOn = mine.has(emoji);
    // optimistic
    setMine((prev) => {
      const next = new Set(prev);
      if (wasOn) next.delete(emoji);
      else next.add(emoji);
      return next;
    });
    setCounts((prev) => ({
      ...prev,
      [emoji]: Math.max(0, (prev[emoji] ?? 0) + (wasOn ? -1 : 1)),
    }));

    startTransition(async () => {
      const res = await toggleReaction(targetKey, emoji);
      if (!res.ok) {
        // revert
        setMine((prev) => {
          const next = new Set(prev);
          if (wasOn) next.add(emoji);
          else next.delete(emoji);
          return next;
        });
        setCounts((prev) => ({
          ...prev,
          [emoji]: Math.max(0, (prev[emoji] ?? 0) + (wasOn ? 1 : -1)),
        }));
        if (res.error === "not-signed-in") setHint("Logga in för att reagera.");
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {FADES_EMOJIS.map((emoji) => {
        const n = counts[emoji] ?? 0;
        const on = mine.has(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onClick(emoji)}
            aria-pressed={on}
            className={`flex items-center gap-1 border px-2 py-1 text-sm leading-none transition ${
              on
                ? "border-yellow bg-yellow/15 text-yellow"
                : "border-border text-dim hover:border-cyan"
            }`}
          >
            <span>{emoji}</span>
            {n > 0 && <span className="text-[11px] tabular-nums">{n}</span>}
          </button>
        );
      })}
      {hint && (
        <span className="ml-1 text-[10px] uppercase tracking-widest text-dim">
          {hint}
        </span>
      )}
    </div>
  );
}
