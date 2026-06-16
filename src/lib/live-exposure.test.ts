import { describe, expect, it } from "vitest";
import {
  buildExposure,
  matchDayKey,
  matchesOnDay,
  type OwnershipIndex,
} from "./live-exposure";
import type { WcMatch, WcTeam } from "./wc-tournament";

// ─── Fixtures ────────────────────────────────────────────────────────────────

// Aftonbladet team ids = the nation ids that show up as homeTeamId/awayTeamId
// and (as `ab:club:{id}`) on our clubs.
const BRA = 4286;
const SRB = 3990;
const FRA = 3969;
const CRO = 3975;

const teamsById = new Map<number, WcTeam>([
  [BRA, { externalId: BRA, code: "BRA", name: "Brasilien" }],
  [SRB, { externalId: SRB, code: "SRB", name: "Serbien" }],
  [FRA, { externalId: FRA, code: "FRA", name: "Frankrike" }],
  [CRO, { externalId: CRO, code: "CRO", name: "Kroatien" }],
]);

function match(
  id: number,
  home: number,
  away: number,
  kickoff: string,
  roundNumber = 3,
): WcMatch {
  return {
    externalId: id,
    kickoff,
    status: "pending",
    matchGroupId: 1,
    roundNumber,
    homeTeamId: home,
    awayTeamId: away,
    homeScore: null,
    awayScore: null,
  };
}

function owner(
  teamId: string,
  teamName: string,
  playerId: string,
  playerName: string,
  position: "GK" | "DEF" | "MID" | "FWD",
  isCaptain = false,
  growthSek = 0,
) {
  return {
    teamId,
    teamName,
    teamSlug: teamName.toLowerCase().replace(/\s+/g, "-"),
    playerId,
    playerName,
    position,
    isCaptain,
    growthSek,
  };
}

// Round 3 ownership: Sebastian owns 2 Brazilians (one captain) + 1 Frenchman;
// "Lag B" owns 1 Brazilian.
function round3Ownership(): OwnershipIndex {
  return new Map([
    [
      3,
      new Map([
        [
          BRA,
          [
            owner("seb", "Svensk pionjarer", "marq", "Marquinhos", "DEF", true, 300_000),
            owner("seb", "Svensk pionjarer", "endrick", "Endrick", "FWD", false, -100_000),
            owner("lagb", "Lag B", "vini", "Vinicius", "FWD", false, 200_000),
          ],
        ],
        [
          FRA,
          [owner("seb", "Svensk pionjarer", "maignan", "Maignan", "GK", false, 150_000)],
        ],
      ]),
    ],
  ]);
}

// ─── Date helpers ────────────────────────────────────────────────────────────

describe("matchDayKey", () => {
  it("renders the Pacific (match-day) calendar day", () => {
    // 06:00 UTC on 2026-06-14 is 23:00 on 2026-06-13 in LA (PDT, UTC-7) →
    // an early-UTC instant belongs to the PREVIOUS American match day.
    expect(matchDayKey("2026-06-14T06:00:00Z")).toBe("2026-06-13");
    // 19:00 UTC same day is 12:00 PDT — squarely 2026-06-14 in America.
    expect(matchDayKey("2026-06-14T19:00:00Z")).toBe("2026-06-14");
  });
});

describe("matchesOnDay", () => {
  it("keeps only fixtures on the given match-day key, sorted by kickoff", () => {
    const ms = [
      match(2, FRA, CRO, "2026-06-14T23:00:00Z"), // 16:00 PDT, 14th
      match(1, BRA, SRB, "2026-06-14T20:00:00Z"), // 13:00 PDT, 14th
      match(3, BRA, FRA, "2026-06-15T19:00:00Z"), // 12:00 PDT, 15th
    ];
    const out = matchesOnDay(ms, "2026-06-14");
    expect(out.map((m) => m.externalId)).toEqual([1, 2]);
  });
});

// ─── Golden master: revealed round ──────────────────────────────────────────

describe("buildExposure (revealed round)", () => {
  const result = buildExposure({
    matches: [
      match(1, BRA, SRB, "2026-06-14T13:00:00Z"),
      match(2, FRA, CRO, "2026-06-14T16:00:00Z"),
    ],
    teamsById,
    ownership: round3Ownership(),
    revealedRounds: new Set([3]),
    dateKey: "2026-06-14",
  });

  it("attaches owners to the right nation", () => {
    const m1 = result.matches[0];
    expect(m1.revealed).toBe(true);
    expect(m1.home?.code).toBe("BRA");
    // Brazil exposes two fantasy teams; Sebastian first (more players).
    expect(m1.home?.teams.map((t) => t.teamId)).toEqual(["seb", "lagb"]);
    expect(m1.home?.teams[0].players.map((p) => p.playerName)).toEqual([
      "Marquinhos",
      "Endrick",
    ]);
    // Serbia: nobody owns a Serb.
    expect(m1.away?.code).toBe("SRB");
    expect(m1.away?.teams).toEqual([]);
  });

  it("flags the captain", () => {
    const seb = result.matches[0].home!.teams[0];
    expect(seb.players.find((p) => p.playerName === "Marquinhos")?.isCaptain).toBe(
      true,
    );
    expect(seb.players.find((p) => p.playerName === "Endrick")?.isCaptain).toBe(
      false,
    );
  });

  it("aggregates distinct players and matches per team", () => {
    // Sebastian: Marquinhos+Endrick (match1) + Maignan (match2) = 3 players, 2 matches.
    // Day growth = 300k − 100k + 150k = 350k, PLUS captain (Marquinhos) bonus
    // = +300k (growth ×(2−1), positive) → 650k.
    const seb = result.leaderboard.find((t) => t.teamId === "seb");
    expect(seb).toMatchObject({
      playerCount: 3,
      matchCount: 2,
      growthSek: 650_000,
    });
    const lagb = result.leaderboard.find((t) => t.teamId === "lagb");
    expect(lagb).toMatchObject({
      playerCount: 1,
      matchCount: 1,
      growthSek: 200_000,
    });
    // Sebastian ranks first.
    expect(result.leaderboard[0].teamId).toBe("seb");
    expect(result.allRevealed).toBe(true);
  });
});

// ─── Anti-cheat: unrevealed round withholds rosters ─────────────────────────

describe("buildExposure (anti-cheat gate)", () => {
  it("withholds rosters when the round is not locked/scored", () => {
    const result = buildExposure({
      matches: [match(1, BRA, SRB, "2026-06-14T13:00:00Z")],
      teamsById,
      ownership: round3Ownership(), // index has data...
      revealedRounds: new Set(), // ...but round 3 is NOT revealed
      dateKey: "2026-06-14",
    });
    const m1 = result.matches[0];
    expect(m1.revealed).toBe(false);
    // Nation still resolves (fixture renders) but no fantasy teams leak.
    expect(m1.home?.code).toBe("BRA");
    expect(m1.home?.teams).toEqual([]);
    // And nothing reaches the leaderboard.
    expect(result.leaderboard).toEqual([]);
    expect(result.allRevealed).toBe(false);
  });
});
