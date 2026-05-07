import { describe, expect, it } from "vitest";
import { scoreSquadForRound, type ScoringInputs } from "./scoring";

function snap(
  id: string,
  growthSek: number,
  priceSek: number = 5_000_000,
): [string, { snapshotId: string; priceSek: number; growthSek: number }] {
  return [id, { snapshotId: `snap-${id}`, priceSek, growthSek }];
}

const ALL_IDS = [
  "gk1",
  "d1",
  "d2",
  "d3",
  "d4",
  "m1",
  "m2",
  "m3",
  "f1",
  "f2",
  "f3",
];

// Default exhausts the 50M budget exactly so bank interest = 0. Tests that
// want to exercise bank interest override `purchasePrices` explicitly.
function exhaustedBudget(): Map<string, number> {
  // 1 × 5M + 10 × 4.5M = 5M + 45M = 50M
  const m = new Map<string, number>();
  m.set("gk1", 5_000_000);
  for (const id of ["d1", "d2", "d3", "d4", "m1", "m2", "m3", "f1", "f2", "f3"]) {
    m.set(id, 4_500_000);
  }
  return m;
}

function basicInputs(overrides: Partial<ScoringInputs> = {}): ScoringInputs {
  return {
    squad: {
      players: [
        { id: "gk1", position: "GK" },
        { id: "d1", position: "DEF" },
        { id: "d2", position: "DEF" },
        { id: "d3", position: "DEF" },
        { id: "d4", position: "DEF" },
        { id: "m1", position: "MID" },
        { id: "m2", position: "MID" },
        { id: "m3", position: "MID" },
        { id: "f1", position: "FWD" },
        { id: "f2", position: "FWD" },
        { id: "f3", position: "FWD" },
      ],
      captainPlayerId: "f1",
    },
    scoreSnapshots: new Map(),
    purchasePrices: exhaustedBudget(),
    budgetSek: 50_000_000,
    captainMultiplier: 2,
    captainBonusOnlyPositive: true,
    bankInterestPctPerRound: 0.01,
    transferFeesPaidSek: 0,
    ...overrides,
  };
}

void ALL_IDS;

describe("scoreSquadForRound — golden masters", () => {
  it("all-zero growth, leftover budget yields bank interest", () => {
    // Override purchase prices to leave 6M in the bank: 11 × 4M = 44M spent
    const inputs = basicInputs({
      scoreSnapshots: new Map([
        snap("gk1", 0),
        snap("d1", 0),
        snap("d2", 0),
        snap("d3", 0),
        snap("d4", 0),
        snap("m1", 0),
        snap("m2", 0),
        snap("m3", 0),
        snap("f1", 0),
        snap("f2", 0),
        snap("f3", 0),
      ]),
      purchasePrices: new Map(
        [
          "gk1",
          "d1",
          "d2",
          "d3",
          "d4",
          "m1",
          "m2",
          "m3",
          "f1",
          "f2",
          "f3",
        ].map((id) => [id, 4_000_000]),
      ),
    });
    const r = scoreSquadForRound(inputs);
    expect(r.sumGrowthSek).toBe(0);
    expect(r.captainBonusSek).toBe(0);
    expect(r.bankInterestSek).toBe(60_000); // 6M leftover × 1%
    expect(r.transferFeesSek).toBe(0);
    expect(r.totalPointsSek).toBe(60_000);
    expect(r.missingSnapshots).toEqual([]);
  });

  it("mixed growth + captain × 2 (positive only) — exhausted budget, no bank interest", () => {
    // Total growth: 100k + 50k + 0 + 0 + (-30k) + 200k + 0 + 0 + 500k + 0 + 0 = 820_000
    // Captain f1 grew 500k → bonus = 500k × (2-1) = 500_000
    // Bank = 0 (default budget exhausted)
    // Total = 820_000 + 500_000 = 1_320_000
    const inputs = basicInputs({
      scoreSnapshots: new Map([
        snap("gk1", 100_000),
        snap("d1", 50_000),
        snap("d2", 0),
        snap("d3", 0),
        snap("d4", -30_000),
        snap("m1", 200_000),
        snap("m2", 0),
        snap("m3", 0),
        snap("f1", 500_000), // captain
        snap("f2", 0),
        snap("f3", 0),
      ]),
    });
    const r = scoreSquadForRound(inputs);
    expect(r.sumGrowthSek).toBe(820_000);
    expect(r.captainBonusSek).toBe(500_000);
    expect(r.bankInterestSek).toBe(0);
    expect(r.totalPointsSek).toBe(1_320_000);
  });

  it("captain bonus is floored at 0 when captain growth is negative (positive-only flag on)", () => {
    const inputs = basicInputs({
      scoreSnapshots: new Map([
        snap("gk1", 0),
        snap("d1", 0),
        snap("d2", 0),
        snap("d3", 0),
        snap("d4", 0),
        snap("m1", 0),
        snap("m2", 0),
        snap("m3", 0),
        snap("f1", -200_000), // captain, negative — should NOT double the loss
        snap("f2", 0),
        snap("f3", 0),
      ]),
    });
    const r = scoreSquadForRound(inputs);
    expect(r.sumGrowthSek).toBe(-200_000);
    expect(r.captainBonusSek).toBe(0); // not -200_000
    expect(r.totalPointsSek).toBe(-200_000); // captain loss is in sumGrowth, not doubled
  });

  it("captain bonus DOES double the loss when positive-only flag is off", () => {
    const inputs = basicInputs({
      captainBonusOnlyPositive: false,
      scoreSnapshots: new Map([
        snap("gk1", 0),
        snap("d1", 0),
        snap("d2", 0),
        snap("d3", 0),
        snap("d4", 0),
        snap("m1", 0),
        snap("m2", 0),
        snap("m3", 0),
        snap("f1", -200_000), // captain
        snap("f2", 0),
        snap("f3", 0),
      ]),
    });
    const r = scoreSquadForRound(inputs);
    expect(r.captainBonusSek).toBe(-200_000); // (multiplier - 1) × growth
    expect(r.totalPointsSek).toBe(-400_000); // base loss + doubled penalty
  });

  it("transfer fees deduct from total", () => {
    const inputs = basicInputs({
      scoreSnapshots: new Map([
        snap("gk1", 0),
        snap("d1", 0),
        snap("d2", 0),
        snap("d3", 0),
        snap("d4", 0),
        snap("m1", 0),
        snap("m2", 0),
        snap("m3", 0),
        snap("f1", 100_000),
        snap("f2", 0),
        snap("f3", 0),
      ]),
      transferFeesPaidSek: 75_000,
    });
    const r = scoreSquadForRound(inputs);
    // sumGrowth 100k + captain bonus 100k + bank 0 - fees 75k = 125k
    expect(r.totalPointsSek).toBe(125_000);
    expect(r.transferFeesSek).toBe(75_000);
  });

  it("over-budget squads get zero bank interest, not negative", () => {
    const inputs = basicInputs({
      scoreSnapshots: new Map([
        snap("gk1", 0),
        snap("d1", 0),
        snap("d2", 0),
        snap("d3", 0),
        snap("d4", 0),
        snap("m1", 0),
        snap("m2", 0),
        snap("m3", 0),
        snap("f1", 0),
        snap("f2", 0),
        snap("f3", 0),
      ]),
      purchasePrices: new Map(
        [
          "gk1",
          "d1",
          "d2",
          "d3",
          "d4",
          "m1",
          "m2",
          "m3",
          "f1",
          "f2",
          "f3",
        ].map((id) => [id, 5_000_000]),
      ), // 55M > 50M budget
    });
    const r = scoreSquadForRound(inputs);
    expect(r.bankInterestSek).toBe(0);
    expect(r.totalPointsSek).toBe(0);
  });

  it("snapshotIdsUsed lists every player's snapshot id (audit trail)", () => {
    const inputs = basicInputs({
      scoreSnapshots: new Map([
        snap("gk1", 0),
        snap("d1", 0),
        snap("d2", 0),
        snap("d3", 0),
        snap("d4", 0),
        snap("m1", 0),
        snap("m2", 0),
        snap("m3", 0),
        snap("f1", 0),
        snap("f2", 0),
        snap("f3", 0),
      ]),
    });
    const r = scoreSquadForRound(inputs);
    expect(r.snapshotIdsUsed).toHaveLength(11);
    expect(new Set(r.snapshotIdsUsed).size).toBe(11);
    expect(r.snapshotIdsUsed).toContain("snap-gk1");
    expect(r.snapshotIdsUsed).toContain("snap-f1");
  });

  it("missing snapshots are flagged, not silently zeroed", () => {
    const inputs = basicInputs({
      scoreSnapshots: new Map([
        snap("gk1", 100_000),
        snap("d1", 0),
        snap("d2", 0),
        snap("d3", 0),
        snap("d4", 0),
        snap("m1", 0),
        snap("m2", 0),
        snap("m3", 0),
        // f1 (captain) intentionally missing
        snap("f2", 0),
        snap("f3", 0),
      ]),
    });
    const r = scoreSquadForRound(inputs);
    expect(r.missingSnapshots).toContain("f1");
    expect(r.captainBonusSek).toBe(0); // can't compute without snapshot
  });
});

describe("scoreSquadForRound — determinism", () => {
  it("running the same inputs twice gives identical outputs", () => {
    const inputs = basicInputs({
      scoreSnapshots: new Map([
        snap("gk1", 100_000),
        snap("d1", 50_000),
        snap("d2", -20_000),
        snap("d3", 0),
        snap("d4", 0),
        snap("m1", 80_000),
        snap("m2", 0),
        snap("m3", 0),
        snap("f1", 300_000),
        snap("f2", 0),
        snap("f3", 0),
      ]),
      purchasePrices: new Map(
        [
          "gk1",
          "d1",
          "d2",
          "d3",
          "d4",
          "m1",
          "m2",
          "m3",
          "f1",
          "f2",
          "f3",
        ].map((id) => [id, 4_000_000]),
      ),
    });
    const a = scoreSquadForRound(inputs);
    const b = scoreSquadForRound(inputs);
    expect(b).toEqual(a);
  });
});
