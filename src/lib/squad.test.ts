import { describe, expect, it } from "vitest";
import { isValidSquad, summarize, validateSquad, type SquadCandidate } from "./squad";

function p(
  id: string,
  position: "GK" | "DEF" | "MID" | "FWD",
  priceSek: number,
  clubExternalId: string = "club:liv",
  countryCode: string = "ENG",
) {
  return { id, position, priceSek, clubExternalId, countryCode };
}

/**
 * A canonical legal squad: 4-3-3, exactly 11 players, captain set,
 * cleanly within budget, max 3 per club. Used as the baseline that
 * all the negative tests mutate one thing on.
 */
function legalSquad(): SquadCandidate {
  return {
    captainPlayerId: "fwd1",
    players: [
      p("gk1", "GK", 5_500_000, "club:liv"),
      p("def1", "DEF", 6_500_000, "club:liv"),
      p("def2", "DEF", 5_000_000, "club:liv"),
      p("def3", "DEF", 4_000_000, "club:ars"),
      p("def4", "DEF", 4_000_000, "club:ars"),
      p("mid1", "MID", 4_500_000, "club:ars"),
      p("mid2", "MID", 4_000_000, "club:mci"),
      p("mid3", "MID", 4_000_000, "club:mci"),
      p("fwd1", "FWD", 4_000_000, "club:mci"),
      p("fwd2", "FWD", 4_000_000, "club:bay"),
      p("fwd3", "FWD", 3_500_000, "club:bay"),
    ],
  };
}

describe("validateSquad — legal baseline", () => {
  it("the canonical 4-3-3 squad is accepted", () => {
    expect(validateSquad(legalSquad())).toEqual([]);
    expect(isValidSquad(legalSquad())).toBe(true);
  });
});

describe("validateSquad — squad size", () => {
  it("rejects a squad of 10", () => {
    const s = legalSquad();
    s.players.pop();
    expect(validateSquad(s).some((e) => e.includes("11"))).toBe(true);
  });

  it("rejects a squad of 12", () => {
    const s = legalSquad();
    s.players.push(p("extra", "FWD", 3_000_000, "club:bay"));
    expect(validateSquad(s).length).toBeGreaterThan(0);
  });

  it("rejects an empty squad", () => {
    expect(validateSquad({ players: [], captainPlayerId: null }).length).toBeGreaterThan(0);
  });
});

describe("validateSquad — duplicates", () => {
  it("rejects when the same player id appears twice", () => {
    const s = legalSquad();
    s.players[1] = { ...s.players[0], position: "DEF" }; // dup gk1's id
    expect(validateSquad(s).some((e) => /fler än en gång/i.test(e))).toBe(true);
  });
});

describe("validateSquad — positions", () => {
  it("rejects 0 GKs", () => {
    const s = legalSquad();
    s.players[0] = p("def-extra", "DEF", 4_000_000, "club:bay");
    s.players[3] = p("liv-extra", "MID", 4_000_000, "club:liv");
    // remove what was the GK; now we have 0 GK + others. Check the GK error specifically.
    const errors = validateSquad(s);
    expect(errors.some((e) => /GK/.test(e))).toBe(true);
  });

  it("rejects 2 GKs", () => {
    const s = legalSquad();
    s.players[1] = p("gk2", "GK", 5_000_000, "club:liv"); // replace a DEF with a 2nd GK
    expect(validateSquad(s).some((e) => /GK/.test(e))).toBe(true);
  });

  it("rejects 6 DEFs (over max)", () => {
    const s: SquadCandidate = {
      captainPlayerId: "fwd1",
      players: [
        p("gk1", "GK", 5_500_000, "club:liv"),
        p("d1", "DEF", 4_000_000, "club:liv"),
        p("d2", "DEF", 4_000_000, "club:liv"),
        p("d3", "DEF", 4_000_000, "club:ars"),
        p("d4", "DEF", 4_000_000, "club:ars"),
        p("d5", "DEF", 4_000_000, "club:mci"),
        p("d6", "DEF", 4_000_000, "club:mci"),
        p("m1", "MID", 4_000_000, "club:mci"),
        p("m2", "MID", 4_000_000, "club:bay"),
        p("m3", "MID", 4_000_000, "club:bay"),
        p("fwd1", "FWD", 4_000_000, "club:bay"),
      ],
    };
    expect(validateSquad(s).some((e) => /DEF/.test(e))).toBe(true);
  });

  it("rejects 0 forwards (under min)", () => {
    const s: SquadCandidate = {
      captainPlayerId: "mid1",
      players: [
        p("gk1", "GK", 5_500_000, "club:liv"),
        p("d1", "DEF", 4_000_000, "club:liv"),
        p("d2", "DEF", 4_000_000, "club:liv"),
        p("d3", "DEF", 4_000_000, "club:ars"),
        p("d4", "DEF", 4_000_000, "club:ars"),
        p("d5", "DEF", 4_000_000, "club:ars"),
        p("mid1", "MID", 4_000_000, "club:mci"),
        p("m2", "MID", 4_000_000, "club:mci"),
        p("m3", "MID", 4_000_000, "club:mci"),
        p("m4", "MID", 4_000_000, "club:bay"),
        p("m5", "MID", 4_000_000, "club:bay"),
      ],
    };
    expect(validateSquad(s).some((e) => /FWD/.test(e))).toBe(true);
  });
});

describe("validateSquad — formation", () => {
  it("rejects illegal 4-2-4 (not in legalFormations)", () => {
    const s: SquadCandidate = {
      captainPlayerId: "fwd1",
      players: [
        p("gk1", "GK", 5_500_000, "club:liv"),
        p("d1", "DEF", 4_000_000, "club:liv"),
        p("d2", "DEF", 4_000_000, "club:liv"),
        p("d3", "DEF", 4_000_000, "club:ars"),
        p("d4", "DEF", 4_000_000, "club:ars"),
        p("m1", "MID", 4_000_000, "club:ars"),
        p("m2", "MID", 4_000_000, "club:mci"),
        p("fwd1", "FWD", 4_000_000, "club:mci"),
        p("fwd2", "FWD", 4_000_000, "club:mci"),
        p("fwd3", "FWD", 4_000_000, "club:bay"),
        p("fwd4", "FWD", 4_000_000, "club:bay"),
      ],
    };
    // 4-2-4 is illegal (FWD=4 > max 3). Either the FWD-max OR the formation rule
    // should fire — both are good.
    const errors = validateSquad(s);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("validateSquad — budget", () => {
  it("rejects when total price exceeds budget", () => {
    const s = legalSquad();
    // Bump the captain price so the total goes over 50M.
    s.players[8] = p("fwd1", "FWD", 30_000_000, "club:mci");
    expect(validateSquad(s).some((e) => /budget/i.test(e))).toBe(true);
  });

  it("accepts a squad exactly at budget", () => {
    const s = legalSquad();
    const used = s.players.reduce((a, p) => a + p.priceSek, 0);
    // Add the leftover to the captain so total = exactly 50M.
    s.players[8] = { ...s.players[8], priceSek: s.players[8].priceSek + (50_000_000 - used) };
    expect(validateSquad(s)).toEqual([]);
  });
});

describe("validateSquad — same-club limit", () => {
  it("rejects 4 players from one club", () => {
    const s = legalSquad();
    // Push four liv players in a row.
    s.players[0] = p("gk1", "GK", 5_500_000, "club:liv");
    s.players[1] = p("def1", "DEF", 6_500_000, "club:liv");
    s.players[2] = p("def2", "DEF", 5_000_000, "club:liv");
    s.players[3] = p("def3", "DEF", 4_000_000, "club:liv"); // 4th from liv
    expect(validateSquad(s).some((e) => /klubb/i.test(e))).toBe(true);
  });
});

describe("validateSquad — captain", () => {
  it("rejects when no captain set", () => {
    const s = { ...legalSquad(), captainPlayerId: null };
    expect(validateSquad(s).some((e) => /kapten/i.test(e))).toBe(true);
  });

  it("rejects when captain is not in the squad", () => {
    const s = { ...legalSquad(), captainPlayerId: "ghost" };
    expect(validateSquad(s).some((e) => /kapten/i.test(e))).toBe(true);
  });
});

describe("summarize", () => {
  it("counts positions, clubs, countries and budget", () => {
    const s = summarize(legalSquad());
    expect(s.count).toBe(11);
    expect(s.byPosition).toEqual({ GK: 1, DEF: 4, MID: 3, FWD: 3 });
    expect(s.byClub["club:liv"]).toBe(3);
    expect(s.byClub["club:ars"]).toBe(3);
    expect(s.byClub["club:mci"]).toBe(3);
    expect(s.byClub["club:bay"]).toBe(2);
    expect(s.totalPriceSek).toBeLessThan(50_000_000);
    expect(s.remainingBudgetSek).toBeGreaterThan(0);
  });
});
