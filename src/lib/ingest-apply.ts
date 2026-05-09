import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clubs,
  players,
  playerRoundSnapshots,
  rounds,
} from "@/db/schema";
import {
  planIngest,
  type ExistingState,
  type IngestPlan,
} from "./ingest";
import type { DataSource } from "./sources/types";

export type IngestSummary = {
  sourceId: string;
  clubsInserted: number;
  clubsUpdated: number;
  playersInserted: number;
  playersUpdated: number;
  roundsInserted: number;
  roundsUpdated: number;
  snapshotsInserted: number;
  orphanedPlayers: string[];
};

export async function loadExistingState(): Promise<ExistingState> {
  const [allClubs, allPlayers, allRounds, allSnapshots] = await Promise.all([
    db.select().from(clubs),
    db.select().from(players),
    db.select().from(rounds),
    db.select().from(playerRoundSnapshots),
  ]);

  const clubExtById = new Map(allClubs.map((c) => [c.id, c.externalId]));
  const playerExtById = new Map(allPlayers.map((p) => [p.id, p.externalId]));
  const roundExtById = new Map(allRounds.map((r) => [r.id, r.externalId]));

  return {
    clubs: allClubs.flatMap((c) =>
      c.externalId
        ? [
            {
              externalId: c.externalId,
              name: c.name,
              shortName: c.shortName ?? null,
              countryCode: c.countryCode ?? null,
            },
          ]
        : [],
    ),
    players: allPlayers.flatMap((p) => {
      if (!p.externalId) return [];
      const clubExt = p.clubId ? clubExtById.get(p.clubId) ?? null : null;
      return [
        {
          externalId: p.externalId,
          name: p.name,
          clubExternalId: clubExt,
          position: p.position,
          active: p.active,
        },
      ];
    }),
    rounds: allRounds.flatMap((r) =>
      r.externalId
        ? [
            {
              externalId: r.externalId,
              number: r.number,
              name: r.name,
              deadline: r.deadline ? r.deadline.toISOString() : null,
            },
          ]
        : [],
    ),
    snapshots: allSnapshots.flatMap((s) => {
      const playerExt = playerExtById.get(s.playerId);
      const roundExt = roundExtById.get(s.roundId);
      if (!playerExt || !roundExt) return [];
      return [
        {
          playerExternalId: playerExt,
          roundExternalId: roundExt,
          priceSek: s.priceSek,
          growthSek: s.growthSek,
          source: s.source,
        },
      ];
    }),
  };
}

export async function applyPlan(plan: IngestPlan): Promise<IngestSummary> {
  let clubsInserted = 0;
  let clubsUpdated = 0;
  let playersInserted = 0;
  let playersUpdated = 0;
  let roundsInserted = 0;
  let roundsUpdated = 0;
  let snapshotsInserted = 0;

  // Clubs first — players reference them.
  for (const op of plan.clubs) {
    if (op.kind === "insert-club") {
      await db.insert(clubs).values({
        externalId: op.club.externalId,
        name: op.club.name,
        shortName: op.club.shortName ?? null,
        countryCode: op.club.countryCode ?? null,
      });
      clubsInserted++;
    } else {
      await db
        .update(clubs)
        .set({
          name: op.club.name,
          shortName: op.club.shortName ?? null,
          countryCode: op.club.countryCode ?? null,
        })
        .where(eq(clubs.externalId, op.externalId));
      clubsUpdated++;
    }
  }

  for (const op of plan.rounds) {
    if (op.kind === "insert-round") {
      await db.insert(rounds).values({
        externalId: op.round.externalId,
        number: op.round.number,
        name: op.round.name,
        deadline: op.round.deadline ? new Date(op.round.deadline) : null,
      });
      roundsInserted++;
    } else {
      await db
        .update(rounds)
        .set({
          number: op.round.number,
          name: op.round.name,
          deadline: op.round.deadline ? new Date(op.round.deadline) : null,
        })
        .where(eq(rounds.externalId, op.externalId));
      roundsUpdated++;
    }
  }

  // Players need club_id lookup, so refetch club ids after club inserts.
  const clubIdByExt = new Map(
    (await db.select().from(clubs)).map((c) => [c.externalId, c.id] as const),
  );

  for (const op of plan.players) {
    const clubId = clubIdByExt.get(op.player.clubExternalId) ?? null;
    if (op.kind === "insert-player") {
      await db.insert(players).values({
        externalId: op.player.externalId,
        name: op.player.name,
        clubId,
        position: op.player.position,
        active: op.player.active ?? true,
      });
      playersInserted++;
    } else {
      await db
        .update(players)
        .set({
          name: op.player.name,
          clubId,
          position: op.player.position,
          active: op.player.active ?? true,
          updatedAt: new Date(),
        })
        .where(eq(players.externalId, op.externalId));
      playersUpdated++;
    }
  }

  // Snapshots — need player_id + round_id lookups.
  if (plan.snapshots.length > 0) {
    const playerIdByExt = new Map(
      (await db.select().from(players)).flatMap((p) =>
        p.externalId ? [[p.externalId, p.id] as const] : [],
      ),
    );
    const roundIdByExt = new Map(
      (await db.select().from(rounds)).flatMap((r) =>
        r.externalId ? [[r.externalId, r.id] as const] : [],
      ),
    );

    const rows = plan.snapshots.flatMap((op) => {
      const playerId = playerIdByExt.get(op.snapshot.playerExternalId);
      const roundId = roundIdByExt.get(op.snapshot.roundExternalId);
      if (!playerId || !roundId) return [];
      return [
        {
          playerId,
          roundId,
          priceSek: op.snapshot.priceSek,
          growthSek: op.snapshot.growthSek,
          source: op.source,
        } as const,
      ];
    });

    if (rows.length > 0) {
      // Batch to stay well under Postgres' ~65k bound-param ceiling.
      // Each row binds 5 params → 1000 rows = 5000 params per query.
      const CHUNK = 1000;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db
          .insert(playerRoundSnapshots)
          .values(rows.slice(i, i + CHUNK));
      }
      snapshotsInserted = rows.length;
    }
  }

  return {
    sourceId: "(applied)",
    clubsInserted,
    clubsUpdated,
    playersInserted,
    playersUpdated,
    roundsInserted,
    roundsUpdated,
    snapshotsInserted,
    orphanedPlayers: plan.orphanedPlayers,
  };
}

export async function runIngest(source: DataSource): Promise<IngestSummary> {
  const [incoming, existing] = await Promise.all([
    source.fetchAll(),
    loadExistingState(),
  ]);
  const plan = planIngest(incoming, existing);
  const summary = await applyPlan(plan);
  return { ...summary, sourceId: source.id };
}
