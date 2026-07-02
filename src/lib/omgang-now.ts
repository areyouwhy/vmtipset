/**
 * "Just nu" logic for the /vm/omgang header: which round matters right now
 * and how far it has come. Pure — the DB/API fetch lives in
 * omgang-now-data.ts (split so this stays importable in tests without a DB).
 */

import type { WcMatch } from "@/lib/wc-tournament";

export type RoundLite = {
  number: number;
  name: string;
  status: "upcoming" | "open" | "locked" | "scored";
  deadline: Date | null;
};

export type OmgangNow = RoundLite & {
  matchesTotal: number;
  matchesFinished: number;
  matchesOngoing: number;
};

/**
 * The round to spotlight: an open transfer window beats everything (there's a
 * deadline to sweat), then a locked round in progress, then the latest scored
 * one, then the first upcoming.
 */
export function pickCurrentRound(all: RoundLite[]): RoundLite | null {
  const byNumber = [...all].sort((a, b) => a.number - b.number);
  return (
    byNumber.find((r) => r.status === "open") ??
    byNumber.find((r) => r.status === "locked") ??
    [...byNumber].reverse().find((r) => r.status === "scored") ??
    byNumber.find((r) => r.status === "upcoming") ??
    null
  );
}

export function matchTally(
  matches: Pick<WcMatch, "roundNumber" | "status">[],
  roundNumber: number,
): Pick<OmgangNow, "matchesTotal" | "matchesFinished" | "matchesOngoing"> {
  const inRound = matches.filter((m) => m.roundNumber === roundNumber);
  return {
    matchesTotal: inRound.length,
    matchesFinished: inRound.filter((m) => m.status === "finished").length,
    matchesOngoing: inRound.filter((m) => m.status === "ongoing").length,
  };
}
