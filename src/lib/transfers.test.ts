import { describe, expect, it } from "vitest";
import { computeTransfers } from "./transfers";

describe("computeTransfers", () => {
  it("no diff → no rows, no fee", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b", "c"],
      newPlayerIds: ["a", "b", "c"],
      sellPriceByPlayerId: new Map(),
      transferFeePct: 0.01,
      freeTransfersPerRound: 0,
    });
    expect(r.rows).toEqual([]);
    expect(r.totalFeeSek).toBe(0);
  });

  it("one swap, no free transfers, 1% fee on 5M = 50k", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b", "c"],
      newPlayerIds: ["a", "b", "x"],
      sellPriceByPlayerId: new Map([["c", 5_000_000]]),
      transferFeePct: 0.01,
      freeTransfersPerRound: 0,
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].playerOutId).toBe("c");
    expect(r.rows[0].playerInId).toBe("x");
    expect(r.rows[0].feeSek).toBe(50_000);
    expect(r.totalFeeSek).toBe(50_000);
    expect(r.paidCount).toBe(1);
    expect(r.freeUsed).toBe(0);
  });

  it("first transfer is free when freeTransfersPerRound = 1", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b"],
      newPlayerIds: ["a", "x"],
      sellPriceByPlayerId: new Map([["b", 5_000_000]]),
      transferFeePct: 0.01,
      freeTransfersPerRound: 1,
    });
    expect(r.rows[0].feeSek).toBe(0);
    expect(r.freeUsed).toBe(1);
    expect(r.paidCount).toBe(0);
    expect(r.totalFeeSek).toBe(0);
  });

  it("two transfers, freeTransfersPerRound = 1 → first free, second charged", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b", "c"],
      newPlayerIds: ["a", "x", "y"],
      sellPriceByPlayerId: new Map([
        ["b", 5_000_000],
        ["c", 7_000_000],
      ]),
      transferFeePct: 0.01,
      freeTransfersPerRound: 1,
    });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].feeSek).toBe(0); // free
    expect(r.rows[1].feeSek).toBe(70_000); // 7M × 1%
    expect(r.totalFeeSek).toBe(70_000);
  });

  it("uses floor when fraction × price is not whole", () => {
    const r = computeTransfers({
      previousPlayerIds: ["b"],
      newPlayerIds: ["x"],
      sellPriceByPlayerId: new Map([["b", 4_999_999]]), // 1% = 49_999.99
      transferFeePct: 0.01,
      freeTransfersPerRound: 0,
    });
    expect(r.rows[0].feeSek).toBe(49_999);
  });

  it("zero price for outgoing player → zero fee", () => {
    const r = computeTransfers({
      previousPlayerIds: ["b"],
      newPlayerIds: ["x"],
      sellPriceByPlayerId: new Map(),
      transferFeePct: 0.01,
      freeTransfersPerRound: 0,
    });
    expect(r.rows[0].feeSek).toBe(0);
  });

  it("imbalanced diff: 2 removed, 1 added → only 1 pair (the rest is invalid squad anyway)", () => {
    const r = computeTransfers({
      previousPlayerIds: ["a", "b", "c"],
      newPlayerIds: ["a", "x"],
      sellPriceByPlayerId: new Map([["b", 5_000_000], ["c", 7_000_000]]),
      transferFeePct: 0.01,
      freeTransfersPerRound: 0,
    });
    expect(r.rows).toHaveLength(1);
  });
});
