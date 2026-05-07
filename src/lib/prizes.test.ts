import { describe, expect, it } from "vitest";
import {
  bpsToPercent,
  BPS_DENOMINATOR,
  calculatePotPayout,
  pctToBps,
  validatePlaceShares,
  validatePoolAllocations,
} from "./prizes";

const STANDARD_POOLS = [
  {
    key: "main_league" as const,
    label: "Main",
    allocationBps: 8000,
    places: [
      { place: 1, shareBps: 5000 },
      { place: 2, shareBps: 3000 },
      { place: 3, shareBps: 2000 },
    ],
  },
  {
    key: "daily_bets" as const,
    label: "Daily",
    allocationBps: 2000,
    places: [
      { place: 1, shareBps: 6000 },
      { place: 2, shareBps: 4000 },
    ],
  },
];

describe("calculatePotPayout — golden master scenarios", () => {
  it("zero approved users yields zero pot, zero everywhere", () => {
    const out = calculatePotPayout({
      approvedCount: 0,
      stakeSek: 300,
      pools: STANDARD_POOLS,
    });
    expect(out.totalPotSek).toBe(0);
    expect(out.remainderSek).toBe(0);
    for (const p of out.pools) {
      expect(p.poolAmountSek).toBe(0);
      for (const place of p.places) expect(place.amountSek).toBe(0);
    }
  });

  it("5 users × 300 = 1500 SEK, splits 80/20 → 1200 / 300", () => {
    const out = calculatePotPayout({
      approvedCount: 5,
      stakeSek: 300,
      pools: STANDARD_POOLS,
    });
    expect(out.totalPotSek).toBe(1500);
    expect(out.pools[0].poolAmountSek).toBe(1200);
    expect(out.pools[1].poolAmountSek).toBe(300);
    expect(out.remainderSek).toBe(0);
  });

  it("main league of 1200 SEK pays 600 / 360 / 240", () => {
    const out = calculatePotPayout({
      approvedCount: 5,
      stakeSek: 300,
      pools: STANDARD_POOLS,
    });
    const main = out.pools[0];
    expect(main.places.map((p) => p.amountSek)).toEqual([600, 360, 240]);
    expect(main.remainderSek).toBe(0);
  });

  it("daily bets of 300 SEK pays 180 / 120", () => {
    const out = calculatePotPayout({
      approvedCount: 5,
      stakeSek: 300,
      pools: STANDARD_POOLS,
    });
    const daily = out.pools[1];
    expect(daily.places.map((p) => p.amountSek)).toEqual([180, 120]);
    expect(daily.remainderSek).toBe(0);
  });

  it("100 users × 300 = 30000 SEK works without rounding", () => {
    const out = calculatePotPayout({
      approvedCount: 100,
      stakeSek: 300,
      pools: STANDARD_POOLS,
    });
    expect(out.totalPotSek).toBe(30000);
    expect(out.pools[0].poolAmountSek).toBe(24000);
    expect(out.pools[1].poolAmountSek).toBe(6000);
    expect(out.pools[0].places.map((p) => p.amountSek)).toEqual([
      12000, 7200, 4800,
    ]);
  });
});

describe("calculatePotPayout — rounding behaviour", () => {
  it("captures pot-level rounding leftover instead of silently absorbing it", () => {
    // 7 users × 300 = 2100 SEK, 80% = 1680, 20% = 420 → no leftover for THIS split.
    // Pick a split that DOES round: 1 user × 300 = 300, split 33/33/34 across
    // three equal pools.
    const out = calculatePotPayout({
      approvedCount: 1,
      stakeSek: 300,
      pools: [
        {
          key: "main_league",
          label: "A",
          allocationBps: 3333,
          places: [{ place: 1, shareBps: 10000 }],
        },
        {
          key: "daily_bets",
          label: "B",
          allocationBps: 3333,
          places: [{ place: 1, shareBps: 10000 }],
        },
        {
          key: "main_league" /* shape only — duplicate key allowed for math test */,
          label: "C",
          allocationBps: 3334,
          places: [{ place: 1, shareBps: 10000 }],
        },
      ],
    });
    // floor(300 * 0.3333) = 99, floor(300 * 0.3333) = 99, floor(300 * 0.3334) = 100
    expect(out.pools[0].poolAmountSek).toBe(99);
    expect(out.pools[1].poolAmountSek).toBe(99);
    expect(out.pools[2].poolAmountSek).toBe(100);
    expect(out.remainderSek).toBe(2); // 300 − (99+99+100) = 2
  });

  it("captures place-level rounding leftover per pool", () => {
    // Pool of 100 SEK, split 33/33/34
    const out = calculatePotPayout({
      approvedCount: 1,
      stakeSek: 100,
      pools: [
        {
          key: "main_league",
          label: "Main",
          allocationBps: 10000,
          places: [
            { place: 1, shareBps: 3333 },
            { place: 2, shareBps: 3333 },
            { place: 3, shareBps: 3334 },
          ],
        },
      ],
    });
    expect(out.pools[0].poolAmountSek).toBe(100);
    expect(out.pools[0].places.map((p) => p.amountSek)).toEqual([33, 33, 33]);
    // 100 − (33 + 33 + 33) = 1
    expect(out.pools[0].remainderSek).toBe(1);
  });
});

describe("validatePoolAllocations", () => {
  it("accepts a clean 80/20 split", () => {
    expect(
      validatePoolAllocations([
        { allocationBps: 8000 },
        { allocationBps: 2000 },
      ]),
    ).toEqual([]);
  });

  it("rejects a split that does not sum to 100%", () => {
    expect(
      validatePoolAllocations([
        { allocationBps: 8000 },
        { allocationBps: 1500 },
      ]).length,
    ).toBeGreaterThan(0);
  });

  it("rejects an empty list", () => {
    expect(validatePoolAllocations([]).length).toBeGreaterThan(0);
  });

  it("rejects negative allocations", () => {
    expect(
      validatePoolAllocations([
        { allocationBps: 11000 },
        { allocationBps: -1000 },
      ]).length,
    ).toBeGreaterThan(0);
  });
});

describe("validatePlaceShares", () => {
  it("accepts 50/30/20", () => {
    expect(
      validatePlaceShares([
        { place: 1, shareBps: 5000 },
        { place: 2, shareBps: 3000 },
        { place: 3, shareBps: 2000 },
      ]),
    ).toEqual([]);
  });

  it("rejects when shares do not sum to 100%", () => {
    expect(
      validatePlaceShares([
        { place: 1, shareBps: 5000 },
        { place: 2, shareBps: 3000 },
        { place: 3, shareBps: 1000 },
      ]).length,
    ).toBeGreaterThan(0);
  });

  it("rejects gaps in place numbering (1, 3 missing 2)", () => {
    expect(
      validatePlaceShares([
        { place: 1, shareBps: 5000 },
        { place: 3, shareBps: 5000 },
      ]).length,
    ).toBeGreaterThan(0);
  });

  it("rejects duplicate places", () => {
    // Two place=1 entries — sorting makes the second one need to be place=2.
    expect(
      validatePlaceShares([
        { place: 1, shareBps: 5000 },
        { place: 1, shareBps: 5000 },
      ]).length,
    ).toBeGreaterThan(0);
  });

  it("rejects an empty list", () => {
    expect(validatePlaceShares([]).length).toBeGreaterThan(0);
  });
});

describe("display helpers", () => {
  it("bpsToPercent: integer percents render without decimals", () => {
    expect(bpsToPercent(5000)).toBe("50%");
    expect(bpsToPercent(10000)).toBe("100%");
  });

  it("bpsToPercent: fractional percents keep two decimals", () => {
    expect(bpsToPercent(3333)).toBe("33.33%");
  });

  it("pctToBps round-trips integer values", () => {
    expect(pctToBps(50)).toBe(5000);
    expect(pctToBps(100)).toBe(10000);
  });

  it("BPS_DENOMINATOR is 10000", () => {
    expect(BPS_DENOMINATOR).toBe(10000);
  });
});
