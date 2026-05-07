import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  playerRoundSnapshots,
  players,
  rounds,
  squadPlayers,
  squads,
  teamRoundScores,
  teams,
  transfers,
  type Round,
} from "@/db/schema";
import { currentRules } from "./rules";
import {
  scoreSquadForRound,
  type ScoringSquad,
  type SnapshotForScoring,
} from "./scoring";

export type ScoringTeamLine = {
  teamId: string;
  teamName: string;
  totalPointsSek: number;
  sumGrowthSek: number;
  captainBonusSek: number;
  bankInterestSek: number;
  transferFeesSek: number;
};

export type ScoringSummary = {
  roundId: string;
  roundName: string;
  teamsScored: number;
  results: ScoringTeamLine[];
  warnings: string[];
};

/**
 * Compute and persist `team_round_scores` for one round. Idempotent: re-running
 * wipes previous rows for this round and re-derives. Locks all squads. Flips
 * the round status to `scored`.
 */
export async function scoreRound(roundId: string): Promise<ScoringSummary> {
  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);
  if (!round) throw new Error(`Round ${roundId} not found`);

  const baseRound = await getBaseRound();
  if (!baseRound) {
    throw new Error("No rounds exist — cannot determine purchase prices");
  }

  const squadRows = await db
    .select()
    .from(squads)
    .where(eq(squads.roundId, roundId));
  if (squadRows.length === 0) {
    return {
      roundId,
      roundName: round.name,
      teamsScored: 0,
      results: [],
      warnings: ["Inga trupper för denna rond — inget att poängsätta."],
    };
  }

  const allTeams = await db.select().from(teams);
  const teamById = new Map(allTeams.map((t) => [t.id, t]));

  const allPlayers = await db.select().from(players);
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));

  const squadIds = squadRows.map((s) => s.id);
  const allSquadPlayers = await db
    .select()
    .from(squadPlayers)
    .where(inArray(squadPlayers.squadId, squadIds));
  const playersBySquad = new Map<string, string[]>();
  for (const sp of allSquadPlayers) {
    const arr = playersBySquad.get(sp.squadId) ?? [];
    arr.push(sp.playerId);
    playersBySquad.set(sp.squadId, arr);
  }

  const purchasePriceByPlayer = await loadPurchasePrices(baseRound.id);
  const scoreSnapshotByPlayer = await loadScoreSnapshots(roundId);

  const allTransfers = await db
    .select()
    .from(transfers)
    .where(eq(transfers.roundId, roundId));
  const feesByTeam = new Map<string, number>();
  for (const t of allTransfers) {
    feesByTeam.set(t.teamId, (feesByTeam.get(t.teamId) ?? 0) + t.feeSek);
  }

  // Wipe and recompute. Re-running with the same inputs is identical.
  await db.delete(teamRoundScores).where(eq(teamRoundScores.roundId, roundId));

  const results: ScoringTeamLine[] = [];
  const warnings: string[] = [];

  for (const squad of squadRows) {
    const playerIds = playersBySquad.get(squad.id) ?? [];
    if (playerIds.length === 0) {
      warnings.push(
        `${teamById.get(squad.teamId)?.name ?? squad.teamId}: trupp utan spelare, hoppas över.`,
      );
      continue;
    }

    const scoringSquad: ScoringSquad = {
      players: playerIds.flatMap((pid) => {
        const p = playerById.get(pid);
        return p ? [{ id: p.id, position: p.position }] : [];
      }),
      captainPlayerId: squad.captainPlayerId,
    };

    const result = scoreSquadForRound({
      squad: scoringSquad,
      scoreSnapshots: scoreSnapshotByPlayer,
      purchasePrices: purchasePriceByPlayer,
      budgetSek: currentRules.budgetSek,
      captainMultiplier: currentRules.captainMultiplier,
      captainBonusOnlyPositive: currentRules.captainBonusOnlyPositive,
      bankInterestPctPerRound: currentRules.bankInterestPctPerRound,
      transferFeesPaidSek: feesByTeam.get(squad.teamId) ?? 0,
    });

    if (result.missingSnapshots.length > 0) {
      warnings.push(
        `${teamById.get(squad.teamId)?.name ?? squad.teamId}: saknar snapshot för ${result.missingSnapshots.length} spelare.`,
      );
    }

    await db.insert(teamRoundScores).values({
      teamId: squad.teamId,
      roundId,
      sumGrowthSek: result.sumGrowthSek,
      captainBonusSek: result.captainBonusSek,
      bankInterestSek: result.bankInterestSek,
      transferFeesSek: result.transferFeesSek,
      totalPointsSek: result.totalPointsSek,
      snapshotIdsUsed: result.snapshotIdsUsed,
    });

    if (!squad.lockedAt) {
      await db
        .update(squads)
        .set({ lockedAt: new Date() })
        .where(eq(squads.id, squad.id));
    }

    results.push({
      teamId: squad.teamId,
      teamName: teamById.get(squad.teamId)?.name ?? "?",
      totalPointsSek: result.totalPointsSek,
      sumGrowthSek: result.sumGrowthSek,
      captainBonusSek: result.captainBonusSek,
      bankInterestSek: result.bankInterestSek,
      transferFeesSek: result.transferFeesSek,
    });
  }

  await db
    .update(rounds)
    .set({ status: "scored" })
    .where(eq(rounds.id, roundId));

  return {
    roundId,
    roundName: round.name,
    teamsScored: results.length,
    results: results.sort((a, b) => b.totalPointsSek - a.totalPointsSek),
    warnings,
  };
}

export async function setRoundStatus(
  roundId: string,
  status: "upcoming" | "open" | "locked" | "scored",
): Promise<void> {
  await db.update(rounds).set({ status }).where(eq(rounds.id, roundId));
}

export async function reopenRound(roundId: string): Promise<void> {
  await db.delete(teamRoundScores).where(eq(teamRoundScores.roundId, roundId));
  await db
    .update(rounds)
    .set({ status: "locked" })
    .where(eq(rounds.id, roundId));
}

async function getBaseRound(): Promise<Round | null> {
  const all = await db.select().from(rounds).orderBy(asc(rounds.number));
  return all[0] ?? null;
}

async function loadPurchasePrices(
  baseRoundId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select()
    .from(playerRoundSnapshots)
    .where(eq(playerRoundSnapshots.roundId, baseRoundId));
  const map = new Map<string, number>();
  // Prefer manual snapshots over api
  for (const r of rows) {
    const prev = map.get(r.playerId);
    if (prev === undefined) map.set(r.playerId, r.priceSek);
  }
  for (const r of rows) {
    if (r.source === "manual") map.set(r.playerId, r.priceSek);
  }
  return map;
}

async function loadScoreSnapshots(
  roundId: string,
): Promise<Map<string, SnapshotForScoring>> {
  const rows = await db
    .select()
    .from(playerRoundSnapshots)
    .where(eq(playerRoundSnapshots.roundId, roundId));
  const apiMap = new Map<string, SnapshotForScoring>();
  const manualMap = new Map<string, SnapshotForScoring>();
  for (const r of rows) {
    const target = r.source === "manual" ? manualMap : apiMap;
    target.set(r.playerId, {
      snapshotId: r.id,
      priceSek: r.priceSek,
      growthSek: r.growthSek,
    });
  }
  // Manual wins
  const merged = new Map(apiMap);
  for (const [k, v] of manualMap) merged.set(k, v);
  return merged;
}
