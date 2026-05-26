import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import {
  clubs,
  eventTypes,
  fantasyEventTypes,
  ingestRuns,
  players,
  playerRoundSnapshots,
  rounds,
  squadPlayers,
  squads,
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
  snapshotsUpdated: number;
  orphanedPlayers: string[];
  playersArchived: number;
  squadsInvalidated: number;
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
          totalGrowthSek: s.totalGrowthSek,
          popularity: s.popularity,
          trend: s.trend,
          source: s.source,
          events: s.events ?? [],
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
  let snapshotsUpdated = 0;
  let playersArchived = 0;
  let squadsInvalidated = 0;

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

    const inserts = plan.snapshots.flatMap((op) => {
      if (op.kind !== "insert-snapshot") return [];
      const playerId = playerIdByExt.get(op.snapshot.playerExternalId);
      const roundId = roundIdByExt.get(op.snapshot.roundExternalId);
      if (!playerId || !roundId) return [];
      return [
        {
          playerId,
          roundId,
          priceSek: op.snapshot.priceSek,
          growthSek: op.snapshot.growthSek,
          totalGrowthSek: op.snapshot.totalGrowthSek ?? 0,
          popularity: op.snapshot.popularity ?? 0,
          trend: op.snapshot.trend ?? 0,
          source: op.source,
          events: op.snapshot.events ?? [],
        } as const,
      ];
    });

    if (inserts.length > 0) {
      // Batch to stay well under Postgres' ~65k bound-param ceiling.
      // Each row binds 8 params → 600 rows = 4800 params per query.
      const CHUNK = 600;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        await db
          .insert(playerRoundSnapshots)
          .values(inserts.slice(i, i + CHUNK));
      }
      snapshotsInserted = inserts.length;
    }

    for (const op of plan.snapshots) {
      if (op.kind !== "update-snapshot") continue;
      const playerId = playerIdByExt.get(op.snapshot.playerExternalId);
      const roundId = roundIdByExt.get(op.snapshot.roundExternalId);
      if (!playerId || !roundId) continue;
      await db
        .update(playerRoundSnapshots)
        .set({
          priceSek: op.snapshot.priceSek,
          growthSek: op.snapshot.growthSek,
          totalGrowthSek: op.snapshot.totalGrowthSek ?? 0,
          popularity: op.snapshot.popularity ?? 0,
          trend: op.snapshot.trend ?? 0,
          events: op.snapshot.events ?? [],
          capturedAt: new Date(),
        })
        .where(
          and(
            eq(playerRoundSnapshots.playerId, playerId),
            eq(playerRoundSnapshots.roundId, roundId),
            eq(playerRoundSnapshots.source, "api"),
          ),
        );
      snapshotsUpdated++;
    }
  }

  // Orphans: players the source dropped (eliminated, injured, withdrawn,
  // cut from final squad). Soft-delete via archived_at so the picker hides
  // them; flag any squad still holding them as invalid so the owner has to
  // re-pick. We only archive players not already archived, so the row's
  // archived_at timestamp marks the first time we noticed the drop.
  if (plan.orphanedPlayers.length > 0) {
    const archived = await db
      .update(players)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          inArray(players.externalId, plan.orphanedPlayers),
          isNull(players.archivedAt),
        ),
      )
      .returning({ id: players.id, name: players.name });
    playersArchived = archived.length;

    if (archived.length > 0) {
      const archivedIds = archived.map((p) => p.id);
      const hits = await db
        .select({
          squadId: squadPlayers.squadId,
          playerName: players.name,
        })
        .from(squadPlayers)
        .innerJoin(players, eq(players.id, squadPlayers.playerId))
        .where(inArray(squadPlayers.playerId, archivedIds));

      const namesBySquad = new Map<string, string[]>();
      for (const h of hits) {
        const list = namesBySquad.get(h.squadId) ?? [];
        list.push(h.playerName);
        namesBySquad.set(h.squadId, list);
      }
      for (const [squadId, names] of namesBySquad) {
        const reason = `Spelare borttagna ur VM-poolen: ${names.join(", ")}`;
        await db
          .update(squads)
          .set({
            invalid: true,
            invalidReason: reason,
            updatedAt: new Date(),
          })
          .where(eq(squads.id, squadId));
        squadsInvalidated++;
      }
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
    snapshotsUpdated,
    orphanedPlayers: plan.orphanedPlayers,
    playersArchived,
    squadsInvalidated,
  };
}

export async function runIngest(source: DataSource): Promise<IngestSummary> {
  const [incoming, existing] = await Promise.all([
    source.fetchAll(),
    loadExistingState(),
  ]);
  const plan = planIngest(incoming, existing);
  const summary = await applyPlan(plan);

  // Bust read caches that depend on these tables.
  revalidateTag("players", "max");
  revalidateTag("snapshots", "max");
  revalidateTag("rounds", "max");
  revalidateTag("squads", "max");

  // Upsert raw event taxonomy. Independent of the snapshot diffing flow.
  if (incoming.eventTypes && incoming.eventTypes.length > 0) {
    for (const t of incoming.eventTypes) {
      await db
        .insert(eventTypes)
        .values({
          id: t.id,
          name: t.name,
          title: t.title,
          abbreviation: t.abbreviation ?? null,
          imageUrl: t.imageUrl ?? null,
        })
        .onConflictDoUpdate({
          target: eventTypes.id,
          set: {
            name: t.name,
            title: t.title,
            abbreviation: t.abbreviation ?? null,
            imageUrl: t.imageUrl ?? null,
            updatedAt: new Date(),
          },
        });
    }
  }

  // Upsert fantasy scoring catalog (SEK values).
  if (incoming.fantasyEventTypes && incoming.fantasyEventTypes.length > 0) {
    for (const t of incoming.fantasyEventTypes) {
      await db
        .insert(fantasyEventTypes)
        .values({
          id: t.id,
          name: t.name,
          title: t.title,
          shortTitle: t.shortTitle ?? null,
          valueSek: t.valueSek,
          imageUrl: t.imageUrl ?? null,
        })
        .onConflictDoUpdate({
          target: fantasyEventTypes.id,
          set: {
            name: t.name,
            title: t.title,
            shortTitle: t.shortTitle ?? null,
            valueSek: t.valueSek,
            imageUrl: t.imageUrl ?? null,
            updatedAt: new Date(),
          },
        });
    }
  }

  return { ...summary, sourceId: source.id };
}

/**
 * Same as `runIngest`, but writes an audit row to `ingest_runs` so we can see
 * later that the cron actually fired (and what it did / failed at). Always
 * inserts a started row up front, then updates on success or failure.
 */
export async function runIngestWithLog(
  source: DataSource,
  trigger: "cron" | "admin",
): Promise<IngestSummary> {
  const [row] = await db
    .insert(ingestRuns)
    .values({
      sourceId: source.id,
      trigger,
      startedAt: new Date(),
      ok: false,
    })
    .returning({ id: ingestRuns.id });

  try {
    const summary = await runIngest(source);
    await db
      .update(ingestRuns)
      .set({
        finishedAt: new Date(),
        ok: true,
        summary: summary as unknown as Record<string, unknown>,
      })
      .where(eq(ingestRuns.id, row.id));
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(ingestRuns)
      .set({ finishedAt: new Date(), ok: false, error: message })
      .where(eq(ingestRuns.id, row.id));
    throw err;
  }
}
