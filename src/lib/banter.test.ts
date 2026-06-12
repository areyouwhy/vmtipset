import { describe, expect, it } from "vitest";
import { buildHets, roastFor, splitIntoThirds } from "./banter";
import type { LeaderboardRow } from "./leaderboard";

function row(partial: Partial<LeaderboardRow> & { rank: number }): LeaderboardRow {
  return {
    rank: partial.rank,
    prevRank: partial.prevRank ?? null,
    rankChange: partial.rankChange ?? null,
    teamId: partial.teamId ?? `t${partial.rank}`,
    teamName: partial.teamName ?? `Lag ${partial.rank}`,
    ownerHandle: partial.ownerHandle ?? "owner",
    ownerStatus: partial.ownerStatus ?? "approved",
    totalPointsSek: partial.totalPointsSek ?? 0,
    perRound: partial.perRound ?? [],
    dailyBetsPoints: partial.dailyBetsPoints ?? 1,
    squadValueSek: partial.squadValueSek ?? 0,
    roundGrowthSek: partial.roundGrowthSek ?? 0,
    bankSek: partial.bankSek ?? 0,
    teamValueSek: partial.teamValueSek ?? 0,
  };
}

describe("splitIntoThirds", () => {
  it("splits 30 into even 10/10/10", () => {
    const [a, b, c] = splitIntoThirds(Array.from({ length: 30 }, (_, i) => i));
    expect([a.length, b.length, c.length]).toEqual([10, 10, 10]);
  });

  it("gives the remainder to the earlier groups", () => {
    expect(splitIntoThirds(Array.from({ length: 31 }, (_, i) => i)).map((g) => g.length)).toEqual([11, 10, 10]);
    expect(splitIntoThirds(Array.from({ length: 32 }, (_, i) => i)).map((g) => g.length)).toEqual([11, 11, 10]);
  });

  it("keeps groups contiguous and in order", () => {
    const [a, b, c] = splitIntoThirds([1, 2, 3, 4, 5, 6]);
    expect(a).toEqual([1, 2]);
    expect(b).toEqual([3, 4]);
    expect(c).toEqual([5, 6]);
  });

  it("handles fewer than three items without crashing", () => {
    expect(splitIntoThirds([1, 2]).map((g) => g.length)).toEqual([1, 1, 0]);
    expect(splitIntoThirds([]).map((g) => g.length)).toEqual([0, 0, 0]);
  });
});

describe("roastFor", () => {
  it("crowns rank 1", () => {
    expect(roastFor(row({ rank: 1 }), { maxRank: 10 })).toContain("Etta");
  });

  it("mocks the jumbo", () => {
    expect(roastFor(row({ rank: 10 }), { maxRank: 10 })).toContain("Jumbo");
  });

  it("does not crown or jumbo a one-team field", () => {
    const line = roastFor(row({ rank: 1 }), { maxRank: 1 });
    expect(line).not.toContain("Etta");
    expect(line).not.toContain("Jumbo");
  });

  it("calls out big fallers before smaller signals", () => {
    const line = roastFor(row({ rank: 5, rankChange: -4, bankSek: -100 }), { maxRank: 10 });
    expect(line).toContain("Rasade 4");
  });

  it("celebrates big climbers", () => {
    expect(roastFor(row({ rank: 4, rankChange: 5 }), { maxRank: 10 })).toContain("Klättrade 5");
  });

  it("flags a negative bank", () => {
    expect(roastFor(row({ rank: 5, rankChange: -1, bankSek: -50 }), { maxRank: 10 })).toContain("banken");
  });

  it("is deterministic", () => {
    const r = row({ rank: 6, rankChange: 1, bankSek: 200_000 });
    expect(roastFor(r, { maxRank: 12 })).toBe(roastFor(r, { maxRank: 12 }));
  });
});

describe("buildHets", () => {
  it("sorts by rank and produces three numbered pages", () => {
    const rows = [row({ rank: 3 }), row({ rank: 1 }), row({ rank: 2 })];
    const pages = buildHets(rows);
    expect(pages.map((p) => p.number)).toEqual([1, 2, 3]);
    expect(pages[0].rows[0].rank).toBe(1);
    expect(pages[0].rows[0]).toHaveProperty("roast");
  });
});
