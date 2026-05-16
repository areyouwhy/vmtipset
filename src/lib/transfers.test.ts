import { describe, expect, it } from "vitest";
import { computeTransfers } from "./transfers";

describe("computeTransfers", () => {
  it("no diff → no rows, no fee, no cash flow", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b", "c"],
      newPlayerIds: ["a", "b", "c"],
      priceByPlayerId: new Map(),
      transferFeePct: 0.01,
      freeTransfersPerRound: 0,
    });
    expect(r.rows).toEqual([]);
    expect(r.totalFeeSek).toBe(0);
    expect(r.totalCashFlowSek).toBe(0);
  });

  it("one swap (same price): fee 50k, cash flow 0", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b", "c"],
      newPlayerIds: ["a", "b", "x"],
      priceByPlayerId: new Map([
        ["c", 5_000_000],
        ["x", 5_000_000],
      ]),
      transferFeePct: 0.01,
      freeTransfersPerRound: 0,
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].playerOutId).toBe("c");
    expect(r.rows[0].playerInId).toBe("x");
    expect(r.rows[0].sellPriceSek).toBe(5_000_000);
    expect(r.rows[0].buyPriceSek).toBe(5_000_000);
    expect(r.rows[0].feeSek).toBe(50_000);
    expect(r.totalFeeSek).toBe(50_000);
    expect(r.totalCashFlowSek).toBe(0);
  });

  it("one swap (sell high, buy low): positive cash flow + fee on outgoing", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a"],
      newPlayerIds: ["x"],
      priceByPlayerId: new Map([
        ["a", 10_000_000],
        ["x", 3_000_000],
      ]),
      transferFeePct: 0.01,
      freeTransfersPerRound: 0,
    });
    expect(r.rows[0].sellPriceSek).toBe(10_000_000);
    expect(r.rows[0].buyPriceSek).toBe(3_000_000);
    expect(r.rows[0].feeSek).toBe(100_000); // 1% × 10M
    expect(r.totalCashFlowSek).toBe(7_000_000); // sell − buy
  });

  it("one swap (sell low, buy high): negative cash flow", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a"],
      newPlayerIds: ["x"],
      priceByPlayerId: new Map([
        ["a", 3_000_000],
        ["x", 10_000_000],
      ]),
      transferFeePct: 0.01,
      freeTransfersPerRound: 0,
    });
    expect(r.rows[0].feeSek).toBe(30_000);
    expect(r.totalCashFlowSek).toBe(-7_000_000);
  });

  it("free transfer pays no fee but cash flow still counts", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b"],
      newPlayerIds: ["a", "x"],
      priceByPlayerId: new Map([
        ["b", 5_000_000],
        ["x", 4_000_000],
      ]),
      transferFeePct: 0.01,
      freeTransfersPerRound: 1,
    });
    expect(r.rows[0].feeSek).toBe(0);
    expect(r.freeUsed).toBe(1);
    expect(r.totalCashFlowSek).toBe(1_000_000); // sold 5M, bought 4M
  });

  it("two transfers, freeTransfersPerRound = 1 → first free, second charged", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b", "c"],
      newPlayerIds: ["a", "x", "y"],
      priceByPlayerId: new Map([
        ["b", 5_000_000],
        ["c", 7_000_000],
        ["x", 5_000_000],
        ["y", 6_000_000],
      ]),
      transferFeePct: 0.01,
      freeTransfersPerRound: 1,
    });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].feeSek).toBe(0);
    expect(r.rows[1].feeSek).toBe(70_000);
    expect(r.totalFeeSek).toBe(70_000);
    expect(r.totalCashFlowSek).toBe(5_000_000 - 5_000_000 + (7_000_000 - 6_000_000));
  });

  it("uses floor when fraction × price is not whole", () => {
    const r = computeTransfers({
      previousPlayerIds: ["b"],
      newPlayerIds: ["x"],
      priceByPlayerId: new Map([
        ["b", 4_999_999],
        ["x", 4_999_999],
      ]),
      transferFeePct: 0.01,
      freeTransfersPerRound: 0,
    });
    expect(r.rows[0].feeSek).toBe(49_999);
  });

  it("missing price for either side defaults to 0", () => {
    const r = computeTransfers({
      previousPlayerIds: ["b"],
      newPlayerIds: ["x"],
      priceByPlayerId: new Map(),
      transferFeePct: 0.01,
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
      transferFeePct: 0.01,
      freeTransfersPerRound: 0,
    });
    expect(r.rows).toHaveLength(1);
  });
});
