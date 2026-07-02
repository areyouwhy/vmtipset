import { describe, expect, it } from "vitest";
import type { Leaderboard, LeaderboardRow } from "./leaderboard";
import { buildPositionHistory } from "./position-history";

function makeRow(
  teamId: string,
  rank: number,
  pointsByRound: (number | null)[],
): LeaderboardRow {
  return {
    rank,
    prevRank: null,
    rankChange: null,
    teamId,
    teamName: teamId.toUpperCase(),
    ownerHandle: teamId,
    ownerStatus: "approved",
    totalPointsSek: pointsByRound.reduce<number>((a, p) => a + (p ?? 0), 0),
    perRound: pointsByRound.map((pointsSek, i) => ({
      roundId: `r${i + 1}`,
      roundNumber: i + 1,
      roundName: `Omgång ${i + 1}`,
      pointsSek,
    })),
    dailyBetsPoints: 0,
    squadValueSek: null,
    roundGrowthSek: null,
    bankSek: null,
    teamValueSek: null,
    captainBonusProjectedSek: 0,
    bankInterestProjectedSek: 0,
  };
}

function makeLeaderboard(rows: LeaderboardRow[], scoredCount: number): Leaderboard {
  const roundCount = rows[0]?.perRound.length ?? 0;
  return {
    rounds: Array.from({ length: roundCount }, (_, i) => ({
      id: `r${i + 1}`,
      number: i + 1,
      name: `Omgång ${i + 1}`,
      isScored: i < scoredCount,
    })),
    rows,
    dailyBets: [],
    latestScoredRoundId: scoredCount > 0 ? `r${scoredCount}` : null,
    anyScored: scoredCount > 0,
  };
}

describe("buildPositionHistory", () => {
  it("returns null when no round is scored", () => {
    const lb = makeLeaderboard([makeRow("a", 1, [null]), makeRow("b", 1, [null])], 0);
    expect(buildPositionHistory(lb)).toBeNull();
  });

  it("ranks by cumulative points per round, plus a live NU tick", () => {
    // R1: a=100, b=300, c=200 → b,c,a. R2: a=+400, b=+0, c=+100
    // → cumulative a=500, b=300, c=300 → a first, b/c tied at 2.
    const lb = makeLeaderboard(
      [
        makeRow("a", 1, [100, 400]),
        makeRow("b", 2, [300, 0]),
        makeRow("c", 2, [200, 100]),
      ],
      2,
    );
    const h = buildPositionHistory(lb)!;
    expect(h.ticks).toEqual(["R1", "R2", "NU"]);

    const byId = new Map(h.teams.map((t) => [t.teamId, t]));
    expect(byId.get("a")!.ranks).toEqual([3, 1, 1]);
    expect(byId.get("b")!.ranks).toEqual([1, 2, 2]);
    expect(byId.get("c")!.ranks).toEqual([2, 2, 2]);
    // Teams come out in current-rank order.
    expect(h.teams[0].teamId).toBe("a");
  });

  it("treats unscored/null round points as 0 and derives stats", () => {
    const lb = makeLeaderboard(
      [
        makeRow("a", 1, [100, 400, null]),
        makeRow("b", 2, [300, 0, null]),
        makeRow("c", 2, [200, 100, null]),
      ],
      2,
    );
    const h = buildPositionHistory(lb)!;
    // a climbed 3→1 into R2 — the biggest single-tick climb.
    expect(h.stats.bestClimb).toEqual({ teamName: "A", delta: 2, tick: "R2" });
    // b fell 1→2 into R2.
    expect(h.stats.worstFall).toEqual({ teamName: "B", delta: -1, tick: "R2" });
    // b was #1 once (R1); a is #1 at R2 + NU.
    expect(h.stats.mostAtTop).toEqual({ teamName: "A", count: 2 });
    expect(h.stats.bestRound).toEqual({
      teamName: "A",
      pointsSek: 400,
      roundNumber: 2,
    });
  });

  it("colors lines by current thirds (sida 1/2/3)", () => {
    const rows = ["a", "b", "c", "d", "e", "f"].map((id, i) =>
      makeRow(id, i + 1, [600 - i * 100]),
    );
    const h = buildPositionHistory(makeLeaderboard(rows, 1))!;
    const tiers = h.teams.map((t) => t.tier);
    expect(tiers).toEqual([1, 1, 2, 2, 3, 3]);
  });
});
