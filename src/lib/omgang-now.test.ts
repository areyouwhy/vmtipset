import { describe, expect, it } from "vitest";
import { matchTally, pickCurrentRound, type RoundLite } from "./omgang-now";

function round(number: number, status: RoundLite["status"]): RoundLite {
  return { number, name: `Omgång ${number}`, status, deadline: null };
}

describe("pickCurrentRound", () => {
  it("prefers an open round over everything else", () => {
    const r = pickCurrentRound([
      round(1, "scored"),
      round(2, "locked"),
      round(3, "open"),
      round(4, "upcoming"),
    ]);
    expect(r?.number).toBe(3);
  });

  it("falls back to a locked round in progress", () => {
    const r = pickCurrentRound([
      round(1, "scored"),
      round(2, "locked"),
      round(3, "upcoming"),
    ]);
    expect(r?.number).toBe(2);
  });

  it("falls back to the LATEST scored round", () => {
    const r = pickCurrentRound([
      round(1, "scored"),
      round(2, "scored"),
      round(3, "upcoming"),
    ]);
    expect(r?.number).toBe(2);
  });

  it("falls back to the first upcoming round pre-season", () => {
    const r = pickCurrentRound([round(1, "upcoming"), round(2, "upcoming")]);
    expect(r?.number).toBe(1);
  });

  it("returns null with no rounds", () => {
    expect(pickCurrentRound([])).toBeNull();
  });
});

describe("matchTally", () => {
  it("counts only the given round's matches by status", () => {
    const tally = matchTally(
      [
        { roundNumber: 4, status: "finished" },
        { roundNumber: 4, status: "finished" },
        { roundNumber: 4, status: "ongoing" },
        { roundNumber: 4, status: "pending" },
        { roundNumber: 3, status: "finished" },
      ],
      4,
    );
    expect(tally).toEqual({
      matchesTotal: 4,
      matchesFinished: 2,
      matchesOngoing: 1,
    });
  });
});
