import { describe, expect, it } from "vitest";
import { mockDataset } from "./sources/mock";
import {
  planIngest,
  planIsNoop,
  type ExistingState,
} from "./ingest";

const empty: ExistingState = {
  clubs: [],
  players: [],
  rounds: [],
  snapshots: [],
};

describe("planIngest — first run against empty DB", () => {
  const plan = planIngest(mockDataset, empty);

  it("inserts every incoming club", () => {
    expect(plan.clubs.length).toBe(mockDataset.clubs.length);
    expect(plan.clubs.every((op) => op.kind === "insert-club")).toBe(true);
  });

  it("inserts every incoming player", () => {
    expect(plan.players.length).toBe(mockDataset.players.length);
    expect(plan.players.every((op) => op.kind === "insert-player")).toBe(true);
  });

  it("inserts every incoming round", () => {
    expect(plan.rounds.length).toBe(mockDataset.rounds.length);
    expect(plan.rounds.every((op) => op.kind === "insert-round")).toBe(true);
  });

  it("inserts every incoming snapshot, all attributed to api", () => {
    expect(plan.snapshots.length).toBe(mockDataset.snapshots.length);
    expect(plan.snapshots.every((op) => op.source === "api")).toBe(true);
  });

  it("flags no orphans on a fresh DB", () => {
    expect(plan.orphanedPlayers).toEqual([]);
  });
});

describe("planIngest — idempotency", () => {
  it("re-running against a DB that already mirrors the source is a no-op", () => {
    // Build "existing state" that matches the source exactly.
    const existing: ExistingState = {
      clubs: mockDataset.clubs.map((c) => ({
        externalId: c.externalId,
        name: c.name,
        shortName: c.shortName ?? null,
        countryCode: c.countryCode ?? null,
      })),
      players: mockDataset.players.map((p) => ({
        externalId: p.externalId,
        name: p.name,
        clubExternalId: p.clubExternalId,
        position: p.position,
        active: p.active ?? true,
      })),
      rounds: mockDataset.rounds.map((r) => ({
        externalId: r.externalId,
        number: r.number,
        name: r.name,
        deadline: r.deadline ?? null,
      })),
      snapshots: mockDataset.snapshots.map((s) => ({
        playerExternalId: s.playerExternalId,
        roundExternalId: s.roundExternalId,
        priceSek: s.priceSek,
        growthSek: s.growthSek,
        source: "api" as const,
      })),
    };

    const plan = planIngest(mockDataset, existing);
    expect(planIsNoop(plan)).toBe(true);
    expect(plan.orphanedPlayers).toEqual([]);
  });
});

describe("planIngest — change detection", () => {
  it("emits an update when a club's name changes", () => {
    const existing: ExistingState = {
      clubs: [
        {
          externalId: "club:arg",
          name: "Argentina FC", // was "Argentina"
          shortName: "ARG",
          countryCode: "ARG",
        },
      ],
      players: [],
      rounds: [],
      snapshots: [],
    };
    const plan = planIngest(mockDataset, existing);
    const livOps = plan.clubs.filter(
      (op) =>
        (op.kind === "update-club" && op.externalId === "club:arg") ||
        (op.kind === "insert-club" && op.club.externalId === "club:arg"),
    );
    expect(livOps).toHaveLength(1);
    expect(livOps[0]?.kind).toBe("update-club");
  });

  it("emits an update when a player switches club", () => {
    const existing: ExistingState = {
      clubs: [],
      players: [
        {
          externalId: "p:arg-8",
          name: "Salah",
          clubExternalId: "club:bra", // was liv
          position: "FWD",
          active: true,
        },
      ],
      rounds: [],
      snapshots: [],
    };
    const plan = planIngest(mockDataset, existing);
    const op = plan.players.find(
      (op) =>
        op.kind === "update-player" && op.externalId === "p:arg-8",
    );
    expect(op).toBeDefined();
  });

  it("emits an update when a round's deadline shifts", () => {
    const existing: ExistingState = {
      clubs: [],
      players: [],
      rounds: [
        {
          externalId: "r:1",
          number: 1,
          name: "Round 1",
          deadline: "2026-01-01T00:00:00Z",
        },
      ],
      snapshots: [],
    };
    const plan = planIngest(mockDataset, existing);
    const op = plan.rounds.find(
      (op) => op.kind === "update-round" && op.externalId === "r:1",
    );
    expect(op).toBeDefined();
  });
});

describe("planIngest — snapshots are append-only", () => {
  it("never updates an existing api snapshot, even if value differs", () => {
    const existing: ExistingState = {
      clubs: [],
      players: [],
      rounds: [],
      snapshots: [
        {
          playerExternalId: "p:arg-8",
          roundExternalId: "r:1",
          priceSek: 99_999, // wildly different from incoming
          growthSek: 0,
          source: "api",
        },
      ],
    };
    const plan = planIngest(mockDataset, existing);
    const conflict = plan.snapshots.find(
      (op) =>
        op.snapshot.playerExternalId === "p:arg-8" &&
        op.snapshot.roundExternalId === "r:1",
    );
    expect(conflict).toBeUndefined();
  });

  it("treats a manual snapshot for the same (player, round) as not blocking the api snapshot", () => {
    const existing: ExistingState = {
      clubs: [],
      players: [],
      rounds: [],
      snapshots: [
        {
          playerExternalId: "p:arg-8",
          roundExternalId: "r:1",
          priceSek: 12_345,
          growthSek: 0,
          source: "manual",
        },
      ],
    };
    const plan = planIngest(mockDataset, existing);
    const apiOp = plan.snapshots.find(
      (op) =>
        op.snapshot.playerExternalId === "p:arg-8" &&
        op.snapshot.roundExternalId === "r:1",
    );
    expect(apiOp).toBeDefined();
    expect(apiOp?.source).toBe("api");
  });
});

describe("planIngest — orphans", () => {
  it("flags players the source no longer lists", () => {
    const existing: ExistingState = {
      clubs: [],
      players: [
        ...mockDataset.players.map((p) => ({
          externalId: p.externalId,
          name: p.name,
          clubExternalId: p.clubExternalId,
          position: p.position,
          active: true,
        })),
        {
          externalId: "p:retired-1",
          name: "Old Player",
          clubExternalId: "club:arg",
          position: "FWD",
          active: true,
        },
      ],
      rounds: [],
      snapshots: [],
    };
    const plan = planIngest(mockDataset, existing);
    expect(plan.orphanedPlayers).toEqual(["p:retired-1"]);
  });
});
