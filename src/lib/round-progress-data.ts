/**
 * Per-team "how far has the current round come" progress, for the /tabell rows.
 *
 * Read-only. For each team we count how many of its footballers in the current
 * round's squad have already PLAYED their WC match (their nation's match this
 * round is `finished`), out of the squad size — e.g. `8/11`.
 *
 * "Current round" per team = the latest *released* (locked/scored) squad, the
 * same anti-cheat gate the rest of the leaderboard uses (`getH2HSquads`,
 * `getLeaderboard`). During an `open` round everything freezes on the previous
 * round; when the next round locks it flips over → the counter "starts over".
 *
 * The authoritative "has played" signal is match status from `getAllMatches()`
 * (live Aftonbladet fixtures), NOT snapshot events/growth which are unreliable
 * pre/mid-match.
 */

import { asc } from "drizzle-orm";
import { db } from "@/db";
import {
  clubs,
  players,
  rounds,
  squadPlayers,
  squads,
} from "@/db/schema";
import { externalClubNumericId } from "@/lib/live-exposure";
import { getAllMatches } from "@/lib/wc-tournament";

export type RoundProgress = {
  /** The round this progress is for (the team's latest released squad's round). */
  roundNumber: number;
  /** Squad players whose nation's match this round is finished. */
  played: number;
  /** Squad size. */
  total: number;
};

/**
 * Progress per team for the current (latest released) round, keyed by teamId.
 * Returns {} when no round has been released yet (nothing to show).
 */
export async function getRoundProgress(): Promise<Record<string, RoundProgress>> {
  const [allRounds, allSquads, allSquadPlayers, allPlayers, allClubs, allMatches] =
    await Promise.all([
      db.select().from(rounds).orderBy(asc(rounds.number)),
      db.select().from(squads),
      db.select().from(squadPlayers),
      db.select().from(players),
      db.select().from(clubs),
      getAllMatches().catch(() => []),
    ]);

  // Only locked/scored rounds are released (same gate as getH2HSquads).
  const releasedIds = new Set(
    allRounds
      .filter((r) => r.status === "locked" || r.status === "scored")
      .map((r) => r.id),
  );
  if (releasedIds.size === 0) return {};

  const roundById = new Map(allRounds.map((r) => [r.id, r]));
  const roundOrder = new Map(allRounds.map((r, i) => [r.id, i] as const));

  // Per team, the released squad from the highest-ordered round.
  const latestByTeam = new Map<string, (typeof allSquads)[number]>();
  for (const sq of allSquads) {
    if (!releasedIds.has(sq.roundId)) continue;
    const cur = latestByTeam.get(sq.teamId);
    const newIdx = roundOrder.get(sq.roundId) ?? -1;
    const curIdx = cur ? (roundOrder.get(cur.roundId) ?? -1) : -1;
    if (newIdx > curIdx) latestByTeam.set(sq.teamId, sq);
  }
  if (latestByTeam.size === 0) return {};

  // Finished nations per fantasy round: both sides of each finished match.
  const finishedNationsByRound = new Map<number, Set<number>>();
  for (const m of allMatches) {
    if (m.status !== "finished" || m.homeScore === null) continue;
    let set = finishedNationsByRound.get(m.roundNumber);
    if (!set) {
      set = new Set<number>();
      finishedNationsByRound.set(m.roundNumber, set);
    }
    set.add(m.homeTeamId);
    set.add(m.awayTeamId);
  }

  // player.clubId → nation numeric id (the Aftonbladet team id).
  const clubNationId = new Map<string, number>();
  for (const c of allClubs) {
    const num = externalClubNumericId(c.externalId);
    if (num !== null) clubNationId.set(c.id, num);
  }
  const playerNationId = new Map<string, number>();
  for (const p of allPlayers) {
    if (!p.clubId) continue;
    const nation = clubNationId.get(p.clubId);
    if (nation !== undefined) playerNationId.set(p.id, nation);
  }

  const playersBySquad = new Map<string, string[]>();
  for (const sp of allSquadPlayers) {
    const arr = playersBySquad.get(sp.squadId) ?? [];
    arr.push(sp.playerId);
    playersBySquad.set(sp.squadId, arr);
  }

  const out: Record<string, RoundProgress> = {};
  for (const [teamId, sq] of latestByTeam) {
    const round = roundById.get(sq.roundId);
    if (!round) continue;
    const pids = playersBySquad.get(sq.id) ?? [];
    if (pids.length === 0) continue;
    const finished = finishedNationsByRound.get(round.number) ?? new Set<number>();
    let played = 0;
    for (const pid of pids) {
      const nation = playerNationId.get(pid);
      if (nation !== undefined && finished.has(nation)) played += 1;
    }
    out[teamId] = { roundNumber: round.number, played, total: pids.length };
  }
  return out;
}
