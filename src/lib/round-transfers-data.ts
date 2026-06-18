/**
 * Transfer activity for a round, for the /vm/omgang/[n] page.
 *
 * Read-only. Gated on round status: transfers reveal squad changes, so only
 * surfaced once the round is `locked`/`scored` (window closed) — same anti-cheat
 * rule as the rest of the round stats.
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { players, rounds, teams, transfers } from "@/db/schema";
import { teamSlug } from "@/lib/team-slug";

export type TransferPlayer = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  priceSek: number;
};

export type TeamTransfers = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  totalFeeSek: number;
  /** Net cash from the swaps (Σ sell − buy − fee). */
  netCashSek: number;
  swaps: { out: TransferPlayer; in: TransferPlayer; feeSek: number }[];
};

export type TopMoved = { player: { id: string; name: string }; count: number };

export type RoundTransfersResult =
  | { available: false; roundNumber: number }
  | {
      available: true;
      roundNumber: number;
      total: number;
      teamsActive: number;
      totalFeesSek: number;
      mostIn: TopMoved[];
      mostOut: TopMoved[];
      biggestBuy: { name: string; priceSek: number; teamName: string } | null;
      byTeam: TeamTransfers[];
    };

export async function getRoundTransfers(
  roundNumber: number,
): Promise<RoundTransfersResult> {
  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.number, roundNumber))
    .limit(1);
  if (!round || (round.status !== "locked" && round.status !== "scored")) {
    return { available: false, roundNumber };
  }

  const rows = await db
    .select()
    .from(transfers)
    .where(eq(transfers.roundId, round.id));
  if (rows.length === 0) return { available: false, roundNumber };

  const playerIds = [
    ...new Set(rows.flatMap((r) => [r.playerInId, r.playerOutId])),
  ];
  const teamIds = [...new Set(rows.map((r) => r.teamId))];
  const [playerRows, teamRows] = await Promise.all([
    db.select().from(players).where(inArray(players.id, playerIds)),
    db.select().from(teams).where(inArray(teams.id, teamIds)),
  ]);
  const playerById = new Map(playerRows.map((p) => [p.id, p]));
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  const inCount = new Map<string, number>();
  const outCount = new Map<string, number>();
  let totalFees = 0;
  let biggestBuy: { name: string; priceSek: number; teamName: string } | null =
    null;
  const byTeamMap = new Map<string, TeamTransfers>();

  for (const r of rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    totalFees += r.feeSek;
    inCount.set(r.playerInId, (inCount.get(r.playerInId) ?? 0) + 1);
    outCount.set(r.playerOutId, (outCount.get(r.playerOutId) ?? 0) + 1);

    const pIn = playerById.get(r.playerInId);
    const pOut = playerById.get(r.playerOutId);
    const team = teamById.get(r.teamId);
    const teamName = team?.name ?? "—";

    if (pIn && (!biggestBuy || r.buyPriceSek > biggestBuy.priceSek)) {
      biggestBuy = { name: pIn.name, priceSek: r.buyPriceSek, teamName };
    }

    let tt = byTeamMap.get(r.teamId);
    if (!tt) {
      tt = {
        teamId: r.teamId,
        teamName,
        teamSlug: team ? teamSlug(team.name) : "",
        totalFeeSek: 0,
        netCashSek: 0,
        swaps: [],
      };
      byTeamMap.set(r.teamId, tt);
    }
    tt.totalFeeSek += r.feeSek;
    tt.netCashSek += r.sellPriceSek - r.buyPriceSek - r.feeSek;
    tt.swaps.push({
      out: mk(pOut, r.playerOutId, r.sellPriceSek),
      in: mk(pIn, r.playerInId, r.buyPriceSek),
      feeSek: r.feeSek,
    });
  }

  const topMoved = (m: Map<string, number>): TopMoved[] =>
    [...m.entries()]
      .map(([id, count]) => ({
        player: { id, name: playerById.get(id)?.name ?? "—" },
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

  const byTeam = [...byTeamMap.values()].sort(
    (a, b) => b.swaps.length - a.swaps.length || a.teamName.localeCompare(b.teamName, "sv"),
  );

  return {
    available: true,
    roundNumber,
    total: rows.length,
    teamsActive: byTeamMap.size,
    totalFeesSek: totalFees,
    mostIn: topMoved(inCount),
    mostOut: topMoved(outCount),
    biggestBuy,
    byTeam,
  };
}

function mk(
  p: { name: string; position: "GK" | "DEF" | "MID" | "FWD" } | undefined,
  id: string,
  priceSek: number,
): TransferPlayer {
  return {
    id,
    name: p?.name ?? "—",
    position: p?.position ?? "GK",
    priceSek,
  };
}
