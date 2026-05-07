import { describe, expect, it } from "vitest";
import { autoPickSquad, isValidSquad, type SquadCandidatePlayer } from "./squad";

function p(
  id: string,
  position: "GK" | "DEF" | "MID" | "FWD",
  priceSek: number,
  clubExternalId: string = "club:a",
  countryCode: string = "AAA",
): SquadCandidatePlayer {
  return { id, position, priceSek, clubExternalId, countryCode };
}

/**
 * Build a pool of `n` players per position, all from different clubs/countries
 * to avoid the per-club/country cap getting in the way unless we want it to.
 * Prices increase with index so "cheapest first" is well-defined.
 */
function bigPool(): SquadCandidatePlayer[] {
  const players: SquadCandidatePlayer[] = [];
  for (let i = 0; i < 8; i++) {
    const club = `club:${i}`;
    const country = `C${i.toString().padStart(2, "0")}`;
    players.push(p(`gk-${i}`, "GK", 4_000_000 + i * 100_000, club, country));
    players.push(p(`def-${i}-1`, "DEF", 3_500_000 + i * 100_000, club, country));
    players.push(p(`def-${i}-2`, "DEF", 4_500_000 + i * 100_000, club, country));
    players.push(p(`def-${i}-3`, "DEF", 5_500_000 + i * 100_000, club, country));
    players.push(p(`mid-${i}-1`, "MID", 3_500_000 + i * 100_000, club, country));
    players.push(p(`mid-${i}-2`, "MID", 5_000_000 + i * 100_000, club, country));
    players.push(p(`mid-${i}-3`, "MID", 7_000_000 + i * 100_000, club, country));
    players.push(p(`fwd-${i}-1`, "FWD", 4_500_000 + i * 100_000, club, country));
    players.push(p(`fwd-${i}-2`, "FWD", 7_000_000 + i * 100_000, club, country));
    players.push(p(`fwd-${i}-3`, "FWD", 11_000_000 + i * 100_000, club, country));
  }
  return players;
}

describe("autoPickSquad", () => {
  it("picks a valid 4-3-3 squad from a healthy pool", () => {
    const r = autoPickSquad(bigPool(), { def: 4, mid: 3, fwd: 3 });
    expect(r.ok).toBe(true);
    expect(r.playerIds).toHaveLength(11);
    expect(r.captainPlayerId).not.toBeNull();
    expect(r.totalPriceSek).toBeLessThanOrEqual(50_000_000);
  });

  it("the picked squad passes validateSquad", () => {
    const pool = bigPool();
    const r = autoPickSquad(pool, { def: 4, mid: 3, fwd: 3 });
    const byId = new Map(pool.map((x) => [x.id, x]));
    const players = r.playerIds.flatMap((id) => {
      const x = byId.get(id);
      return x ? [x] : [];
    });
    expect(
      isValidSquad({ players, captainPlayerId: r.captainPlayerId }),
    ).toBe(true);
  });

  it("respects the per-club limit (max 3)", () => {
    // All cheap players concentrated in one club. Auto-pick must spread.
    const concentrated: SquadCandidatePlayer[] = [];
    for (let i = 0; i < 8; i++) {
      const club = `club:${i}`;
      const country = `C${i.toString().padStart(2, "0")}`;
      // Club 0 has all the cheapest players for every position.
      const pricePenalty = i === 0 ? 0 : 100_000;
      concentrated.push(
        p(`gk-${i}`, "GK", 4_000_000 + pricePenalty, club, country),
        p(`def-${i}-1`, "DEF", 3_500_000 + pricePenalty, club, country),
        p(`def-${i}-2`, "DEF", 3_500_000 + pricePenalty + 100_000, club, country),
        p(`def-${i}-3`, "DEF", 3_500_000 + pricePenalty + 200_000, club, country),
        p(`mid-${i}-1`, "MID", 3_500_000 + pricePenalty, club, country),
        p(`mid-${i}-2`, "MID", 3_500_000 + pricePenalty + 100_000, club, country),
        p(`mid-${i}-3`, "MID", 3_500_000 + pricePenalty + 200_000, club, country),
        p(`fwd-${i}-1`, "FWD", 4_500_000 + pricePenalty, club, country),
        p(`fwd-${i}-2`, "FWD", 4_500_000 + pricePenalty + 100_000, club, country),
        p(`fwd-${i}-3`, "FWD", 4_500_000 + pricePenalty + 200_000, club, country),
      );
    }
    const r = autoPickSquad(concentrated, { def: 4, mid: 3, fwd: 3 });
    expect(r.ok).toBe(true);
    const byId = new Map(concentrated.map((x) => [x.id, x]));
    const counts: Record<string, number> = {};
    for (const id of r.playerIds) {
      const club = byId.get(id)?.clubExternalId ?? "";
      counts[club] = (counts[club] ?? 0) + 1;
    }
    for (const c of Object.values(counts)) expect(c).toBeLessThanOrEqual(3);
  });

  it("returns ok: false when the pool can't fill a position", () => {
    // Pool has only 0 GKs.
    const pool = bigPool().filter((p) => p.position !== "GK");
    const r = autoPickSquad(pool, { def: 4, mid: 3, fwd: 3 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("GK");
  });

  it("captain is a forward when forwards are picked", () => {
    const pool = bigPool();
    const r = autoPickSquad(pool, { def: 4, mid: 3, fwd: 3 });
    const byId = new Map(pool.map((x) => [x.id, x]));
    expect(byId.get(r.captainPlayerId!)?.position).toBe("FWD");
  });
});
