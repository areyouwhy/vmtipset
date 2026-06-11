import { describe, expect, it } from "vitest";
import {
  scoreSquadForRound,
  squadPurchaseCostSek,
  type ScoringInputs,
} from "./scoring";

function snap(
  id: string,
  growthSek: number,
  priceSek: number = 5_000_000,
): [string, { snapshotId: string; priceSek: number; growthSek: number }] {
  return [id, { snapshotId: `snap-${id}`, priceSek, growthSek }];
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
    bankEnteringSek: 0, // default: 0 left in bank, so no interest
    transferCashFlowSek: 0,
    transferFeesPaidSek: 0,
    captainMultiplier: 2,
    captainBonusOnlyPositive: true,
    bankInterestPctPerRound: 0.01,
    ...overrides,
  };
}

describe("scoreSquadForRound — golden masters", () => {
  it("zero growth + 6M bank → 60k interest, bank_end = 6.06M, total = 60k", () => {
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
      bankEnteringSek: 6_000_000,
    });
    const r = scoreSquadForRound(inputs);
    expect(r.sumGrowthSek).toBe(0);
    expect(r.captainBonusSek).toBe(0);
    expect(r.bankInterestSek).toBe(60_000);
    expect(r.transferFeesSek).toBe(0);
    expect(r.bankSekEnd).toBe(6_060_000);
    expect(r.totalPointsSek).toBe(60_000); // 0 growth + 60k interest
    expect(r.missingSnapshots).toEqual([]);
  });

  it("mixed growth + captain × 2 (positive only) — exhausted budget, no bank interest", () => {
    // sum growth: 100k + 50k + 0 + 0 + (-30k) + 200k + 0 + 0 + 500k + 0 + 0 = 820k
    // captain f1 grew 500k → bonus = 500k
    // bank entering = 0 → no interest
    // Δ team value = 820k (squad) + 500k (captain) = 1.32M
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
        snap("f1", 500_000),
        snap("f2", 0),
        snap("f3", 0),
      ]),
      bankEnteringSek: 0,
    });
    const r = scoreSquadForRound(inputs);
    expect(r.sumGrowthSek).toBe(820_000);
    expect(r.captainBonusSek).toBe(500_000);
    expect(r.bankInterestSek).toBe(0);
    expect(r.bankSekEnd).toBe(500_000); // 0 + 0 interest + 500k captain
    expect(r.totalPointsSek).toBe(1_320_000);
  });

  it("captain bonus floored at 0 when captain growth is negative (positive-only)", () => {
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
        snap("f1", -200_000),
        snap("f2", 0),
        snap("f3", 0),
      ]),
      bankEnteringSek: 0,
    });
    const r = scoreSquadForRound(inputs);
    expect(r.sumGrowthSek).toBe(-200_000);
    expect(r.captainBonusSek).toBe(0); // not -200_000
    expect(r.bankSekEnd).toBe(0); // captain bonus 0, no interest
    expect(r.totalPointsSek).toBe(-200_000); // pure squad loss
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
        snap("f1", -200_000),
        snap("f2", 0),
        snap("f3", 0),
      ]),
    });
    const r = scoreSquadForRound(inputs);
    expect(r.captainBonusSek).toBe(-200_000);
    expect(r.bankSekEnd).toBe(-200_000); // captain "bonus" debited
    expect(r.totalPointsSek).toBe(-400_000);
  });

  it("transfer fees + cash flow show in total and reduce bank_end via bankEntering", () => {
    // The caller is expected to have already applied fees + cashFlow when
    // computing bankEnteringSek. We just restate them here for the breakdown.
    // bankEntering = 6M (post-transfer-window cash including the fee+flow adjustments).
    // Growth = 100k. Captain f1 = 100k → bonus 100k.
    // Interest = 60k. Captain credit = 100k. Bank end = 6_160_000.
    // Δ team value = 100k growth + 100k captain + 60k interest + (-250k cashFlow) − 75k fees
    //              = -65_000
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
      bankEnteringSek: 6_000_000,
      transferFeesPaidSek: 75_000,
      transferCashFlowSek: -250_000,
    });
    const r = scoreSquadForRound(inputs);
    expect(r.transferFeesSek).toBe(75_000);
    expect(r.transferCashFlowSek).toBe(-250_000);
    expect(r.bankInterestSek).toBe(60_000);
    expect(r.bankSekEnd).toBe(6_160_000); // 6M entering + 60k interest + 100k captain
    expect(r.totalPointsSek).toBe(100_000 + 100_000 + 60_000 - 250_000 - 75_000);
  });

  it("negative bank entering yields zero interest, no penalty", () => {
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
      bankEnteringSek: -1_000_000, // shouldn't happen in practice but be safe
    });
    const r = scoreSquadForRound(inputs);
    expect(r.bankInterestSek).toBe(0);
    expect(r.bankSekEnd).toBe(-1_000_000); // unchanged: 0 interest, 0 captain
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
        // f1 (captain) missing
        snap("f2", 0),
        snap("f3", 0),
      ]),
    });
    const r = scoreSquadForRound(inputs);
    expect(r.missingSnapshots).toContain("f1");
    expect(r.captainBonusSek).toBe(0);
  });
});

describe("scoreSquadForRound — multi-round trajectory (hand-rolled)", () => {
  it("two consecutive rounds: bank threads forward, growth moves squad", () => {
    // Initial pick (round 1):
    //   11 players × 4M = 44M spent, bank entering = 50M − 44M = 6M
    //   round 1 sum growth = 1M (only m1 = 1M, rest 0)
    //   captain f1 growth = 0 → bonus 0
    //   interest = 60k
    //   bank_end_1 = 6M + 60k + 0 = 6_060_000
    //   Δ team value R1 = 1M + 0 + 60k + 0 − 0 = 1_060_000
    const r1 = scoreSquadForRound(
      basicInputs({
        bankEnteringSek: 6_000_000,
        scoreSnapshots: new Map([
          snap("gk1", 0, 4_000_000),
          snap("d1", 0, 4_000_000),
          snap("d2", 0, 4_000_000),
          snap("d3", 0, 4_000_000),
          snap("d4", 0, 4_000_000),
          snap("m1", 1_000_000, 4_000_000),
          snap("m2", 0, 4_000_000),
          snap("m3", 0, 4_000_000),
          snap("f1", 0, 4_000_000),
          snap("f2", 0, 4_000_000),
          snap("f3", 0, 4_000_000),
        ]),
      }),
    );
    expect(r1.bankSekEnd).toBe(6_060_000);
    expect(r1.totalPointsSek).toBe(1_060_000);

    // Round 2 (no transfers): bank entering = bank_end_1 = 6_060_000.
    //   m1 grew another 500k. captain f1 also grew 500k → bonus 500k.
    //   interest = floor(6_060_000 × 0.01) = 60_600
    //   bank_end_2 = 6_060_000 + 60_600 + 500_000 = 6_620_600
    //   Δ team value R2 = 1_000_000 + 500_000 + 60_600 = 1_560_600
    //   (sum growth = m1 500k + f1 500k = 1_000_000)
    const r2 = scoreSquadForRound(
      basicInputs({
        bankEnteringSek: r1.bankSekEnd,
        scoreSnapshots: new Map([
          snap("gk1", 0, 4_000_000),
          snap("d1", 0, 4_000_000),
          snap("d2", 0, 4_000_000),
          snap("d3", 0, 4_000_000),
          snap("d4", 0, 4_000_000),
          snap("m1", 500_000, 5_000_000), // price drifted up
          snap("m2", 0, 4_000_000),
          snap("m3", 0, 4_000_000),
          snap("f1", 500_000, 4_000_000),
          snap("f2", 0, 4_000_000),
          snap("f3", 0, 4_000_000),
        ]),
      }),
    );
    expect(r2.sumGrowthSek).toBe(1_000_000);
    expect(r2.captainBonusSek).toBe(500_000);
    expect(r2.bankInterestSek).toBe(60_600);
    expect(r2.bankSekEnd).toBe(6_620_600);
    expect(r2.totalPointsSek).toBe(1_560_600);
  });
});

describe("scoreSquadForRound — determinism", () => {
  it("running the same inputs twice gives identical outputs", () => {
    const inputs = basicInputs({
      bankEnteringSek: 6_000_000,
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
    });
    const a = scoreSquadForRound(inputs);
    const b = scoreSquadForRound(inputs);
    expect(b).toEqual(a);
  });
});

describe("squadPurchaseCostSek", () => {
  it("with no growth, cost equals the sum of prices", () => {
    expect(
      squadPurchaseCostSek([
        { priceSek: 4_000_000, growthSek: 0 },
        { priceSek: 3_000_000, growthSek: 0 },
      ]),
    ).toBe(7_000_000);
  });

  it("strips in-round growth: cost is the purchase price, not current value", () => {
    // A player bought at 3.0M who has gained 142k is now priced 3.142M.
    // Purchase cost must read 3.0M, not 3.142M.
    expect(
      squadPurchaseCostSek([{ priceSek: 3_142_000, growthSek: 142_000 }]),
    ).toBe(3_000_000);
  });

  it("golden master: Kartagos Örnar Round 1 — bank stays ~0 despite +142k growth", () => {
    // 10 players at flat baseline summing to 47.0M + Quínones at 3.142M (+142k).
    // Current value = 50.142M; purchase cost must be 50.0M so bank = budget − cost = 0.
    const BUDGET = 50_000_000;
    const flat = [
      4_000_000, 4_500_000, 3_500_000, 4_500_000, 2_500_000, 4_500_000,
      3_000_000, 2_500_000, 8_500_000, 9_500_000,
    ].map((priceSek) => ({ priceSek, growthSek: 0 }));
    const snaps = [...flat, { priceSek: 3_142_000, growthSek: 142_000 }];

    const currentValue = snaps.reduce((a, s) => a + s.priceSek, 0);
    const cost = squadPurchaseCostSek(snaps);

    expect(currentValue).toBe(50_142_000);
    expect(cost).toBe(50_000_000);
    expect(BUDGET - cost).toBe(0); // correct bank
    expect(BUDGET - currentValue).toBe(-142_000); // the OLD buggy bank
  });

  it("handles negative growth (a player who lost value)", () => {
    // Bought at 5.0M, now priced 4.8M (−200k) → purchase cost still 5.0M.
    expect(
      squadPurchaseCostSek([{ priceSek: 4_800_000, growthSek: -200_000 }]),
    ).toBe(5_000_000);
  });
});
