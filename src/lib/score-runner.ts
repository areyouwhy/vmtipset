import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidateTag } from "next/cache";
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
  transferCashFlowSek: number;
  bankSekEnd: number;
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
 * wipes previous rows for this round and re-derives.
 *
 * Bank is path-dependent: we need the prior round's `bank_sek_end` for each
 * team, so the runner walks rounds in order from Round 1 and re-scores
 * everything from the target round onwards. Cheap because state is small.
 */
export async function scoreRound(roundId: string): Promise<ScoringSummary> {
  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);
  if (!round) throw new Error(`Round ${roundId} not found`);

  const allRoundsSorted = await db.select().from(rounds).orderBy(asc(rounds.number));
  // Re-score from the target round forward — but to know bank_end for round N
  // we must already have bank_end for N-1. Safest: re-score from the earliest
  // unscored round to the target.
  const targetIdx = allRoundsSorted.findIndex((r) => r.id === roundId);
  if (targetIdx < 0) throw new Error(`Round ${roundId} not in ordered list`);
  // Always rescore from round 1 forward to be safe — re-running with the same
  // inputs is identical, so this is cheap and correct.
  const roundsToProcess = allRoundsSorted.slice(0, targetIdx + 1);

  const allTeams = await db.select().from(teams);
  const teamById = new Map(allTeams.map((t) => [t.id, t]));

  const allPlayers = await db.select().from(players);
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));

  // bank_end_{N-1} per team, threaded as we walk forward. Round 1's
  // "entering bank" is computed from budget − initial squad cost, not from
  // this map.
  const bankEndByTeam = new Map<string, number>();

  let lastSummary: ScoringSummary | null = null;

  for (const r of roundsToProcess) {
    lastSummary = await scoreOneRound(r.id, r.number, r.name, {
      bankEndByTeam,
      teamById,
      playerById,
    });
  }

  // Lock the target round + auto-inherit squads to the next round. Only do
  // this for the user-requested target, not the intermediate rescored rounds.
  await db.update(rounds).set({ status: "scored" }).where(eq(rounds.id, roundId));

  const targetSquads = await db
    .select()
    .from(squads)
    .where(eq(squads.roundId, roundId));
  const targetSquadIds = targetSquads.map((s) => s.id);
  const targetSquadPlayers =
    targetSquadIds.length > 0
      ? await db
          .select()
          .from(squadPlayers)
          .where(inArray(squadPlayers.squadId, targetSquadIds))
      : [];
  const playersBySquad = new Map<string, string[]>();
  for (const sp of targetSquadPlayers) {
    const arr = playersBySquad.get(sp.squadId) ?? [];
    arr.push(sp.playerId);
    playersBySquad.set(sp.squadId, arr);
  }
  await inheritSquadsForNextRound(round.number, targetSquads, playersBySquad);

  revalidateTag("scores", "max");
  revalidateTag("leaderboard", "max");
  revalidateTag("rounds", "max");
  revalidateTag("squads", "max");

  return lastSummary ?? {
    roundId,
    roundName: round.name,
    teamsScored: 0,
    results: [],
    warnings: [],
  };
}

type RunnerCtx = {
  bankEndByTeam: Map<string, number>;
  teamById: Map<string, { id: string; name: string }>;
  playerById: Map<string, { id: string; position: import("@/db/schema").Position }>;
};

async function scoreOneRound(
  roundId: string,
  roundNumber: number,
  roundName: string,
  ctx: RunnerCtx,
): Promise<ScoringSummary> {
  const squadRows = await db
    .select()
    .from(squads)
    .where(eq(squads.roundId, roundId));
  if (squadRows.length === 0) {
    return {
      roundId,
      roundName,
      teamsScored: 0,
      results: [],
      warnings: ["Inga trupper för denna rond — inget att poängsätta."],
    };
  }

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

  const scoreSnapshotByPlayer = await loadScoreSnapshots(roundId);

  const allTransfers = await db
    .select()
    .from(transfers)
    .where(eq(transfers.roundId, roundId));
  const feesByTeam = new Map<string, number>();
  const cashFlowByTeam = new Map<string, number>();
  for (const t of allTransfers) {
    feesByTeam.set(t.teamId, (feesByTeam.get(t.teamId) ?? 0) + t.feeSek);
    cashFlowByTeam.set(
      t.teamId,
      (cashFlowByTeam.get(t.teamId) ?? 0) + (t.sellPriceSek - t.buyPriceSek),
    );
  }

  // Wipe and recompute for this round.
  await db.delete(teamRoundScores).where(eq(teamRoundScores.roundId, roundId));

  const results: ScoringTeamLine[] = [];
  const warnings: string[] = [];

  for (const squad of squadRows) {
    const playerIds = playersBySquad.get(squad.id) ?? [];
    if (playerIds.length === 0) {
      warnings.push(
        `${ctx.teamById.get(squad.teamId)?.name ?? squad.teamId}: trupp utan spelare, hoppas över.`,
      );
      continue;
    }

    const scoringSquad: ScoringSquad = {
      players: playerIds.flatMap((pid) => {
        const p = ctx.playerById.get(pid);
        return p ? [{ id: p.id, position: p.position }] : [];
      }),
      captainPlayerId: squad.captainPlayerId,
    };

    const teamFees = feesByTeam.get(squad.teamId) ?? 0;
    const teamCashFlow = cashFlowByTeam.get(squad.teamId) ?? 0;

    // bankEntering = bank AFTER the transfer window closes for this round,
    // i.e. AFTER fees + cash flow are applied. For Round 1 there's no prior
    // bank: entering bank = budget − initial squad cost (at Round 1 prices).
    let bankEntering: number;
    if (roundNumber === 1) {
      const initialCost = playerIds.reduce((acc, pid) => {
        const snap = scoreSnapshotByPlayer.get(pid);
        return acc + (snap?.priceSek ?? 0);
      }, 0);
      bankEntering = currentRules.budgetSek - initialCost;
    } else {
      const prevBank = ctx.bankEndByTeam.get(squad.teamId);
      if (prevBank === undefined) {
        // Team has no prior round_score — they joined mid-tournament. Best
        // we can do: derive from this round's snapshot cost as if it were
        // the initial purchase. Flag a warning.
        const initialCost = playerIds.reduce((acc, pid) => {
          const snap = scoreSnapshotByPlayer.get(pid);
          return acc + (snap?.priceSek ?? 0);
        }, 0);
        bankEntering = currentRules.budgetSek - initialCost;
        warnings.push(
          `${ctx.teamById.get(squad.teamId)?.name ?? squad.teamId}: ingen tidigare bank-balans hittad — antar att detta är deras startrond.`,
        );
      } else {
        bankEntering = prevBank + teamCashFlow - teamFees;
      }
    }

    const result = scoreSquadForRound({
      squad: scoringSquad,
      scoreSnapshots: scoreSnapshotByPlayer,
      bankEnteringSek: bankEntering,
      transferCashFlowSek: teamCashFlow,
      transferFeesPaidSek: teamFees,
      captainMultiplier: currentRules.captainMultiplier,
      captainBonusOnlyPositive: currentRules.captainBonusOnlyPositive,
      bankInterestPctPerRound: currentRules.bankInterestPctPerRound,
    });

    if (result.missingSnapshots.length > 0) {
      warnings.push(
        `${ctx.teamById.get(squad.teamId)?.name ?? squad.teamId}: saknar snapshot för ${result.missingSnapshots.length} spelare.`,
      );
    }

    await db.insert(teamRoundScores).values({
      teamId: squad.teamId,
      roundId,
      sumGrowthSek: result.sumGrowthSek,
      captainBonusSek: result.captainBonusSek,
      bankInterestSek: result.bankInterestSek,
      transferFeesSek: result.transferFeesSek,
      transferCashFlowSek: result.transferCashFlowSek,
      bankSekEnd: result.bankSekEnd,
      totalPointsSek: result.totalPointsSek,
      snapshotIdsUsed: result.snapshotIdsUsed,
    });

    ctx.bankEndByTeam.set(squad.teamId, result.bankSekEnd);

    if (!squad.lockedAt) {
      await db
        .update(squads)
        .set({ lockedAt: new Date() })
        .where(eq(squads.id, squad.id));
    }

    results.push({
      teamId: squad.teamId,
      teamName: ctx.teamById.get(squad.teamId)?.name ?? "?",
      totalPointsSek: result.totalPointsSek,
      sumGrowthSek: result.sumGrowthSek,
      captainBonusSek: result.captainBonusSek,
      bankInterestSek: result.bankInterestSek,
      transferFeesSek: result.transferFeesSek,
      transferCashFlowSek: result.transferCashFlowSek,
      bankSekEnd: result.bankSekEnd,
    });
  }

  return {
    roundId,
    roundName,
    teamsScored: results.length,
    results: results.sort((a, b) => b.totalPointsSek - a.totalPointsSek),
    warnings,
  };
}

async function inheritSquadsForNextRound(
  currentNumber: number,
  scoredSquads: { id: string; teamId: string; captainPlayerId: string | null }[],
  playersBySquad: Map<string, string[]>,
): Promise<void> {
  const allRounds = await db.select().from(rounds).orderBy(asc(rounds.number));
  const next = allRounds.find((r) => r.number === currentNumber + 1);
  if (!next) return;

  for (const sq of scoredSquads) {
    const [exists] = await db
      .select()
      .from(squads)
      .where(and(eq(squads.teamId, sq.teamId), eq(squads.roundId, next.id)))
      .limit(1);
    if (exists) continue;

    const [created] = await db
      .insert(squads)
      .values({
        teamId: sq.teamId,
        roundId: next.id,
        captainPlayerId: sq.captainPlayerId,
      })
      .returning();

    const ids = playersBySquad.get(sq.id) ?? [];
    if (ids.length > 0) {
      await db.insert(squadPlayers).values(
        ids.map((pid) => ({ squadId: created.id, playerId: pid })),
      );
    }
  }
}

export async function setRoundStatus(
  roundId: string,
  status: "upcoming" | "open" | "locked" | "scored",
): Promise<void> {
  await db.update(rounds).set({ status }).where(eq(rounds.id, roundId));
  revalidateTag("rounds", "max");
  revalidateTag("leaderboard", "max");
}

export async function reopenRound(roundId: string): Promise<void> {
  await db.delete(teamRoundScores).where(eq(teamRoundScores.roundId, roundId));
  await db
    .update(rounds)
    .set({ status: "locked" })
    .where(eq(rounds.id, roundId));
  revalidateTag("rounds", "max");
  revalidateTag("scores", "max");
  revalidateTag("leaderboard", "max");
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
