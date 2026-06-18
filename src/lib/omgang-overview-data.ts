/**
 * Aggregate overview across ALL rounds, for the /vm/omgang hub page:
 * combined round-stat highlights + cross-round transfer totals + a per-round
 * index (status + counts) for navigation.
 *
 * Read-only. Transfer rows only exist once a window has closed, and the
 * per-round highlights come from getRoundStats, which already gates on
 * locked/scored — so nothing here leaks an open round's picks.
 */

import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { players, rounds, teams, transfers } from "@/db/schema";
import { getRejectedTeamIds } from "@/lib/active-teams";
import { getRoundStats } from "@/lib/round-stats-data";
import { teamSlug } from "@/lib/team-slug";

export type OverviewPlayerCount = {
  id: string;
  name: string;
  count: number;
};

export type OmgangOverview = {
  rounds: { number: number; status: string; transferCount: number }[];
  playedCount: number;
  transfers: {
    totalChanges: number;
    totalFeesSek: number;
    teamsActive: number;
    mostIn: OverviewPlayerCount | null;
    mostOut: OverviewPlayerCount | null;
    biggestBuy: {
      name: string;
      priceSek: number;
      teamName: string;
      roundNumber: number;
    } | null;
    highestFee: {
      feeSek: number;
      teamName: string;
      roundNumber: number;
      outName: string;
      inName: string;
    } | null;
    mostActiveTeam: { teamName: string; teamSlug: string; count: number } | null;
  };
  highlights: {
    bestPick: { name: string; growthSek: number; roundNumber: number } | null;
    worstPick: { name: string; growthSek: number; roundNumber: number } | null;
    bestCaptain: { name: string; growthSek: number; roundNumber: number } | null;
    topPlayer: { name: string; count: number; roundNumber: number } | null;
  };
};

export async function getOmgangOverview(): Promise<OmgangOverview> {
  const allRounds = await db.select().from(rounds).orderBy(asc(rounds.number));
  const roundNumberById = new Map(allRounds.map((r) => [r.id, r.number]));
  const played = allRounds.filter(
    (r) => r.status === "locked" || r.status === "scored",
  );

  const rejected = await getRejectedTeamIds();
  const txRows = (await db.select().from(transfers)).filter(
    (r) => !rejected.has(r.teamId),
  );
  const playerIds = [
    ...new Set(txRows.flatMap((r) => [r.playerInId, r.playerOutId])),
  ];
  const teamIds = [...new Set(txRows.map((r) => r.teamId))];
  const [playerRows, teamRows] = await Promise.all([
    playerIds.length
      ? db.select().from(players).where(inArray(players.id, playerIds))
      : Promise.resolve([]),
    teamIds.length
      ? db.select().from(teams).where(inArray(teams.id, teamIds))
      : Promise.resolve([]),
  ]);
  const playerById = new Map(playerRows.map((p) => [p.id, p]));
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  const txCountByRound = new Map<string, number>();
  const inCount = new Map<string, number>();
  const outCount = new Map<string, number>();
  const teamCount = new Map<string, number>();
  let totalFees = 0;
  let biggestBuy: OmgangOverview["transfers"]["biggestBuy"] = null;
  let highestFee: OmgangOverview["transfers"]["highestFee"] = null;

  for (const r of txRows) {
    txCountByRound.set(r.roundId, (txCountByRound.get(r.roundId) ?? 0) + 1);
    inCount.set(r.playerInId, (inCount.get(r.playerInId) ?? 0) + 1);
    outCount.set(r.playerOutId, (outCount.get(r.playerOutId) ?? 0) + 1);
    teamCount.set(r.teamId, (teamCount.get(r.teamId) ?? 0) + 1);
    totalFees += r.feeSek;
    const roundNumber = roundNumberById.get(r.roundId) ?? 0;
    const teamName = teamById.get(r.teamId)?.name ?? "—";
    if (!biggestBuy || r.buyPriceSek > biggestBuy.priceSek) {
      biggestBuy = {
        name: playerById.get(r.playerInId)?.name ?? "—",
        priceSek: r.buyPriceSek,
        teamName,
        roundNumber,
      };
    }
    if (!highestFee || r.feeSek > highestFee.feeSek) {
      highestFee = {
        feeSek: r.feeSek,
        teamName,
        roundNumber,
        outName: playerById.get(r.playerOutId)?.name ?? "—",
        inName: playerById.get(r.playerInId)?.name ?? "—",
      };
    }
  }

  const topCount = (m: Map<string, number>): OverviewPlayerCount | null => {
    let best: OverviewPlayerCount | null = null;
    for (const [id, count] of m) {
      if (!best || count > best.count) {
        best = { id, name: playerById.get(id)?.name ?? "—", count };
      }
    }
    return best;
  };

  let mostActiveTeam: OmgangOverview["transfers"]["mostActiveTeam"] = null;
  for (const [tid, count] of teamCount) {
    if (!mostActiveTeam || count > mostActiveTeam.count) {
      const t = teamById.get(tid);
      mostActiveTeam = {
        teamName: t?.name ?? "—",
        teamSlug: t ? teamSlug(t.name) : "",
        count,
      };
    }
  }

  // Combined round-stat highlights: best-of across every played round, each
  // annotated with the round it happened in.
  const statsList = await Promise.all(
    played.map((r) => getRoundStats(r.number).catch(() => null)),
  );
  const highlights: OmgangOverview["highlights"] = {
    bestPick: null,
    worstPick: null,
    bestCaptain: null,
    topPlayer: null,
  };
  for (const s of statsList) {
    if (!s || !s.available) continue;
    const rn = s.roundNumber;
    const { bestPick, worstPick, bestCaptainPick, topPlayer } = s.stats;
    if (
      bestPick &&
      (!highlights.bestPick || bestPick.growthSek > highlights.bestPick.growthSek)
    ) {
      highlights.bestPick = {
        name: bestPick.name,
        growthSek: bestPick.growthSek,
        roundNumber: rn,
      };
    }
    if (
      worstPick &&
      (!highlights.worstPick ||
        worstPick.growthSek < highlights.worstPick.growthSek)
    ) {
      highlights.worstPick = {
        name: worstPick.name,
        growthSek: worstPick.growthSek,
        roundNumber: rn,
      };
    }
    if (
      bestCaptainPick &&
      (!highlights.bestCaptain ||
        bestCaptainPick.player.growthSek > highlights.bestCaptain.growthSek)
    ) {
      highlights.bestCaptain = {
        name: bestCaptainPick.player.name,
        growthSek: bestCaptainPick.player.growthSek,
        roundNumber: rn,
      };
    }
    if (
      topPlayer &&
      (!highlights.topPlayer || topPlayer.count > highlights.topPlayer.count)
    ) {
      highlights.topPlayer = {
        name: topPlayer.player.name,
        count: topPlayer.count,
        roundNumber: rn,
      };
    }
  }

  return {
    rounds: allRounds.map((r) => ({
      number: r.number,
      status: r.status,
      transferCount: txCountByRound.get(r.id) ?? 0,
    })),
    playedCount: played.length,
    transfers: {
      totalChanges: txRows.length,
      totalFeesSek: totalFees,
      teamsActive: teamCount.size,
      mostIn: topCount(inCount),
      mostOut: topCount(outCount),
      biggestBuy,
      highestFee,
      mostActiveTeam,
    },
    highlights,
  };
}
