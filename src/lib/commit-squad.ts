import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { squadPlayers, squads, transfers } from "@/db/schema";
import { currentRules } from "@/lib/rules";
import {
  validateSquad,
  type SquadBudgetContext,
  type SquadCandidate,
} from "@/lib/squad";
import {
  getBankEnteringForRound,
  getPickablePlayers,
  getPreviousRoundSquadPlayerIds,
} from "@/lib/squad-data";
import { computeTransfers, type TransferDiff } from "@/lib/transfers";

export type CommitSquadResult = {
  ok: boolean;
  errors: string[];
  transfers?: { count: number; totalFeeSek: number; freeUsed: number };
};

export type EvaluateSquadResult = {
  ok: boolean;
  errors: string[];
  /** null for the very first (build) squad — no prior round to diff against. */
  transferDiff: TransferDiff | null;
};

/**
 * Dry-run validation of a desired squad for a round: legality + budget, against
 * the prices of `priceRoundId` (defaults to the round itself). No writes.
 *
 * `priceRoundId` lets the pre-transfer flow validate a draft for an upcoming
 * round that has no snapshots yet by falling back to the previous round's
 * prices — clearly provisional, re-checked for real at apply time.
 */
export async function evaluateSquad(args: {
  teamId: string;
  round: { id: string; number: number };
  playerIds: string[];
  captainPlayerId: string | null;
  priceRoundId?: string;
}): Promise<EvaluateSquadResult> {
  const { teamId, round, playerIds, captainPlayerId } = args;
  const priceRoundId = args.priceRoundId ?? round.id;

  const pickable = await getPickablePlayers(priceRoundId);
  const byId = new Map(pickable.map((p) => [p.id, p]));
  const players = playerIds.flatMap((id) => {
    const p = byId.get(id);
    return p
      ? [
          {
            id: p.id,
            position: p.position,
            clubExternalId: p.clubExternalId,
            countryCode: p.countryCode,
            priceSek: p.priceSek,
            growthSek: p.growthSek,
          },
        ]
      : [];
  });
  if (players.length !== playerIds.length) {
    return { ok: false, errors: ["Okänd spelare i truppen."], transferDiff: null };
  }

  const candidate: SquadCandidate = { players, captainPlayerId };

  // Transfers are diffed against the PREVIOUS ROUND's committed squad.
  const referencePlayerIds = await getPreviousRoundSquadPlayerIds(
    teamId,
    round.number,
  );
  const transferDiff =
    referencePlayerIds === null
      ? null
      : computeTransfers({
          previousPlayerIds: referencePlayerIds,
          newPlayerIds: playerIds,
          priceByPlayerId: new Map(pickable.map((p) => [p.id, p.priceSek])),
          transferFeePct: currentRules.transferFeePct,
          freeTransfersPerRound: currentRules.freeTransfersPerRound,
        });

  const bankEnteringSek = await getBankEnteringForRound(teamId, round.number);
  const referenceValueSek =
    referencePlayerIds?.reduce(
      (acc, id) => acc + (byId.get(id)?.priceSek ?? 0),
      0,
    ) ?? 0;
  const budgetCtx: SquadBudgetContext = {
    mode: referencePlayerIds === null ? "build" : "transfer",
    bankEnteringSek,
    referenceValueSek,
    transferFeesSek: transferDiff?.totalFeeSek ?? 0,
  };
  const errors = validateSquad(candidate, budgetCtx);
  return { ok: errors.length === 0, errors, transferDiff };
}

/**
 * Server-authoritative validate-and-persist core for a team's squad in a round.
 *
 * The single engine behind BOTH the live picker save (saveSquadAction) and the
 * pre-transfer apply step (applyDraftsForRound). It does NOT do auth or
 * round-status gating — the caller decides whether a write is allowed. Validates
 * against the round's CURRENT prices and, if valid, writes the squad,
 * squad_players and transfer rows (delete-then-insert, so re-running only ever
 * records the net change vs the previous round — never accumulates fees).
 *
 * Because both paths share this code, an applied pre-transfer is byte-identical
 * to the owner having saved it manually during the open window.
 */
export async function commitSquad(args: {
  teamId: string;
  round: { id: string; number: number };
  playerIds: string[];
  captainPlayerId: string | null;
}): Promise<CommitSquadResult> {
  const { teamId, round, playerIds, captainPlayerId } = args;

  const evald = await evaluateSquad({ teamId, round, playerIds, captainPlayerId });
  if (!evald.ok) return { ok: false, errors: evald.errors };
  const transferDiff = evald.transferDiff;

  // Persist. No transactions over Neon HTTP — sequence carefully.
  const [existing] = await db
    .select({ id: squads.id })
    .from(squads)
    .where(and(eq(squads.teamId, teamId), eq(squads.roundId, round.id)))
    .limit(1);

  let squadId: string;
  if (existing) {
    await db
      .update(squads)
      .set({
        captainPlayerId,
        invalid: false,
        invalidReason: null,
        updatedAt: new Date(),
      })
      .where(eq(squads.id, existing.id));
    squadId = existing.id;
    await db.delete(squadPlayers).where(eq(squadPlayers.squadId, squadId));
  } else {
    const [created] = await db
      .insert(squads)
      .values({ teamId, roundId: round.id, captainPlayerId })
      .returning();
    squadId = created.id;
  }

  await db
    .insert(squadPlayers)
    .values(playerIds.map((pid) => ({ squadId, playerId: pid })));

  await db
    .delete(transfers)
    .where(and(eq(transfers.teamId, teamId), eq(transfers.roundId, round.id)));
  if (transferDiff && transferDiff.rows.length > 0) {
    await db.insert(transfers).values(
      transferDiff.rows.map((r) => ({
        teamId,
        roundId: round.id,
        playerInId: r.playerInId,
        playerOutId: r.playerOutId,
        sellPriceSek: r.sellPriceSek,
        buyPriceSek: r.buyPriceSek,
        feeSek: r.feeSek,
      })),
    );
  }

  return {
    ok: true,
    errors: [],
    transfers: transferDiff
      ? {
          count: transferDiff.rows.length,
          totalFeeSek: transferDiff.totalFeeSek,
          freeUsed: transferDiff.freeUsed,
        }
      : undefined,
  };
}
