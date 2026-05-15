import type {
  ExternalClub,
  ExternalDataset,
  ExternalPlayer,
  ExternalRound,
  ExternalSnapshot,
} from "@/lib/sources/types";
import type { Position } from "@/db/schema";

/**
 * Pure planning layer for ingesting an external dataset into our DB.
 *
 * The plan describes what *would* change without touching the database, so
 * it's trivial to test, audit, and dry-run. An apply layer (separate) takes
 * the plan and actually writes to Postgres.
 */

export type ClubKnown = {
  externalId: string;
  name: string;
  shortName: string | null;
  countryCode: string | null;
};

export type PlayerKnown = {
  externalId: string;
  name: string;
  clubExternalId: string | null;
  position: Position;
  active: boolean;
};

export type RoundKnown = {
  externalId: string;
  number: number;
  name: string;
  deadline: string | null;
};

export type SnapshotKnown = {
  playerExternalId: string;
  roundExternalId: string;
  priceSek: number;
  growthSek: number;
  totalGrowthSek: number;
  popularity: number;
  trend: number;
  source: "api" | "manual";
};

export type ExistingState = {
  clubs: ClubKnown[];
  players: PlayerKnown[];
  rounds: RoundKnown[];
  snapshots: SnapshotKnown[];
};

export type ClubOp =
  | { kind: "insert-club"; club: ExternalClub }
  | { kind: "update-club"; externalId: string; club: ExternalClub };

export type PlayerOp =
  | { kind: "insert-player"; player: ExternalPlayer }
  | { kind: "update-player"; externalId: string; player: ExternalPlayer };

export type RoundOp =
  | { kind: "insert-round"; round: ExternalRound }
  | { kind: "update-round"; externalId: string; round: ExternalRound };

export type SnapshotOp =
  | {
      kind: "insert-snapshot";
      snapshot: ExternalSnapshot;
      source: "api";
    }
  | {
      kind: "update-snapshot";
      snapshot: ExternalSnapshot;
      source: "api";
    };

export type IngestPlan = {
  clubs: ClubOp[];
  players: PlayerOp[];
  rounds: RoundOp[];
  snapshots: SnapshotOp[];
  /** External ids the source dropped — flagged for admin review, not auto-deleted. */
  orphanedPlayers: string[];
};

export function planIngest(
  incoming: ExternalDataset,
  existing: ExistingState,
): IngestPlan {
  // Clubs
  const existingClubsByExtId = new Map(
    existing.clubs.map((c) => [c.externalId, c]),
  );
  const clubs: ClubOp[] = [];
  for (const c of incoming.clubs) {
    const prev = existingClubsByExtId.get(c.externalId);
    if (!prev) {
      clubs.push({ kind: "insert-club", club: c });
    } else if (clubChanged(prev, c)) {
      clubs.push({ kind: "update-club", externalId: c.externalId, club: c });
    }
  }

  // Players
  const existingPlayersByExtId = new Map(
    existing.players.map((p) => [p.externalId, p]),
  );
  const players: PlayerOp[] = [];
  for (const p of incoming.players) {
    const prev = existingPlayersByExtId.get(p.externalId);
    if (!prev) {
      players.push({ kind: "insert-player", player: p });
    } else if (playerChanged(prev, p)) {
      players.push({ kind: "update-player", externalId: p.externalId, player: p });
    }
  }

  // Rounds
  const existingRoundsByExtId = new Map(
    existing.rounds.map((r) => [r.externalId, r]),
  );
  const rounds: RoundOp[] = [];
  for (const r of incoming.rounds) {
    const prev = existingRoundsByExtId.get(r.externalId);
    if (!prev) {
      rounds.push({ kind: "insert-round", round: r });
    } else if (roundChanged(prev, r)) {
      rounds.push({ kind: "update-round", externalId: r.externalId, round: r });
    }
  }

  // Snapshots — upsert on (player, round, source=api). Mid-round prices and
  // growth values do change at Aftonbladet (player movement, late goal counted
  // into growth, etc.), so we update existing api rows in place. Scoring
  // captures the snapshot ids it used at compute time into
  // `team_round_scores.snapshotIdsUsed`, so an audit trail still exists.
  // Manual snapshots are written through a separate admin path, never here.
  const existingApiSnapshotsByKey = new Map(
    existing.snapshots
      .filter((s) => s.source === "api")
      .map((s) => [snapshotKey(s.playerExternalId, s.roundExternalId), s]),
  );
  const snapshots: SnapshotOp[] = [];
  for (const s of incoming.snapshots) {
    const key = snapshotKey(s.playerExternalId, s.roundExternalId);
    const prev = existingApiSnapshotsByKey.get(key);
    const incomingTotalGrowth = s.totalGrowthSek ?? 0;
    const incomingPopularity = s.popularity ?? 0;
    const incomingTrend = s.trend ?? 0;
    if (!prev) {
      snapshots.push({ kind: "insert-snapshot", snapshot: s, source: "api" });
    } else if (
      prev.priceSek !== s.priceSek ||
      prev.growthSek !== s.growthSek ||
      prev.totalGrowthSek !== incomingTotalGrowth ||
      prev.popularity !== incomingPopularity ||
      prev.trend !== incomingTrend
    ) {
      snapshots.push({ kind: "update-snapshot", snapshot: s, source: "api" });
    }
  }

  // Orphans: players we have that the source no longer mentions
  const incomingPlayerIds = new Set(incoming.players.map((p) => p.externalId));
  const orphanedPlayers = existing.players
    .filter((p) => !incomingPlayerIds.has(p.externalId))
    .map((p) => p.externalId);

  return { clubs, players, rounds, snapshots, orphanedPlayers };
}

function snapshotKey(playerExtId: string, roundExtId: string): string {
  return `${playerExtId}::${roundExtId}`;
}

function clubChanged(prev: ClubKnown, next: ExternalClub): boolean {
  return (
    prev.name !== next.name ||
    (prev.shortName ?? null) !== (next.shortName ?? null) ||
    (prev.countryCode ?? null) !== (next.countryCode ?? null)
  );
}

function playerChanged(prev: PlayerKnown, next: ExternalPlayer): boolean {
  return (
    prev.name !== next.name ||
    prev.clubExternalId !== next.clubExternalId ||
    prev.position !== next.position ||
    prev.active !== (next.active ?? true)
  );
}

function roundChanged(prev: RoundKnown, next: ExternalRound): boolean {
  return (
    prev.number !== next.number ||
    prev.name !== next.name ||
    (prev.deadline ?? null) !== (next.deadline ?? null)
  );
}

export function planIsNoop(plan: IngestPlan): boolean {
  return (
    plan.clubs.length === 0 &&
    plan.players.length === 0 &&
    plan.rounds.length === 0 &&
    plan.snapshots.length === 0
  );
}
