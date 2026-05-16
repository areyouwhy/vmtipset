import { describe, expect, it } from "vitest";
import { computeTransfers } from "./transfers";

describe("computeTransfers", () => {
  it("no diff → no rows, no fee, no cash flow", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b", "c"],
      newPlayerIds: ["a", "b", "c"],
      priceByPlayerId: new Map(),
      transferFeePct: 0.007,
      freeTransfersPerRound: 0,
    });
    expect(r.rows).toEqual([]);
    expect(r.totalFeeSek).toBe(0);
    expect(r.totalCashFlowSek).toBe(0);
  });

  it("one swap (same price): fee 0.7% × buy = 35k, cash flow 0", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b", "c"],
      newPlayerIds: ["a", "b", "x"],
      priceByPlayerId: new Map([
        ["c", 5_000_000],
        ["x", 5_000_000],
      ]),
      transferFeePct: 0.007,
      freeTransfersPerRound: 0,
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].playerOutId).toBe("c");
    expect(r.rows[0].playerInId).toBe("x");
    expect(r.rows[0].sellPriceSek).toBe(5_000_000);
    expect(r.rows[0].buyPriceSek).toBe(5_000_000);
    expect(r.rows[0].feeSek).toBe(35_000); // floor(5M × 0.007)
    expect(r.totalFeeSek).toBe(35_000);
    expect(r.totalCashFlowSek).toBe(0);
  });

  it("upgrade (sell low, buy high): negative cash flow, fee on buy price", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a"],
      newPlayerIds: ["x"],
      priceByPlayerId: new Map([
        ["a", 3_000_000],
        ["x", 10_000_000],
      ]),
      transferFeePct: 0.007,
      freeTransfersPerRound: 0,
    });
    expect(r.rows[0].sellPriceSek).toBe(3_000_000);
    expect(r.rows[0].buyPriceSek).toBe(10_000_000);
    expect(r.rows[0].feeSek).toBe(70_000); // floor(10M × 0.007)
    expect(r.totalCashFlowSek).toBe(-7_000_000);
  });

  it("downgrade (sell high, buy low): positive cash flow, smaller fee", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a"],
      newPlayerIds: ["x"],
      priceByPlayerId: new Map([
        ["a", 10_000_000],
        ["x", 3_000_000],
      ]),
      transferFeePct: 0.007,
      freeTransfersPerRound: 0,
    });
    expect(r.rows[0].feeSek).toBe(21_000); // floor(3M × 0.007)
    expect(r.totalCashFlowSek).toBe(7_000_000);
  });

  it("free transfer pays no fee but cash flow still counts", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b"],
      newPlayerIds: ["a", "x"],
      priceByPlayerId: new Map([
        ["b", 5_000_000],
        ["x", 4_000_000],
      ]),
      transferFeePct: 0.007,
      freeTransfersPerRound: 1,
    });
    expect(r.rows[0].feeSek).toBe(0);
    expect(r.freeUsed).toBe(1);
    expect(r.totalCashFlowSek).toBe(1_000_000); // sold 5M, bought 4M
  });

  it("two transfers, freeTransfersPerRound = 1 → first free, second charged on buy", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b", "c"],
      newPlayerIds: ["a", "x", "y"],
      priceByPlayerId: new Map([
        ["b", 5_000_000],
        ["c", 7_000_000],
        ["x", 5_000_000],
        ["y", 6_000_000],
      ]),
      transferFeePct: 0.007,
      freeTransfersPerRound: 1,
    });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].feeSek).toBe(0);
    expect(r.rows[1].feeSek).toBe(42_000); // floor(6M × 0.007)
    expect(r.totalFeeSek).toBe(42_000);
    expect(r.totalCashFlowSek).toBe(
      5_000_000 - 5_000_000 + (7_000_000 - 6_000_000),
    );
  });

  it("uses floor when fraction × buy is not whole", () => {
    const r = computeTransfers({
      previousPlayerIds: ["b"],
      newPlayerIds: ["x"],
      priceByPlayerId: new Map([
        ["b", 5_000_000],
        ["x", 4_999_999], // 0.007 × 4_999_999 = 34_999.993
      ]),
      transferFeePct: 0.007,
      freeTransfersPerRound: 0,
    });
    expect(r.rows[0].feeSek).toBe(34_999);
  });

  it("missing price for either side defaults to 0", () => {
    const r = computeTransfers({
      previousPlayerIds: ["b"],
      newPlayerIds: ["x"],
      priceByPlayerId: new Map(),
      transferFeePct: 0.007,
      freeTransfersPerRound: 0,
    });
    expect(r.rows[0].sellPriceSek).toBe(0);
    expect(r.rows[0].buyPriceSek).toBe(0);
    expect(r.rows[0].feeSek).toBe(0);
    expect(r.totalCashFlowSek).toBe(0);
  });

  it("imbalanced diff: 2 removed, 1 added → only 1 pair", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b", "c"],
      newPlayerIds: ["a", "x"],
      priceByPlayerId: new Map([
        ["b", 5_000_000],
        ["c", 7_000_000],
        ["x", 5_000_000],
      ]),
      transferFeePct: 0.007,
      freeTransfersPerRound: 0,
    });
    expect(r.rows).toHaveLength(1);
  });
});
