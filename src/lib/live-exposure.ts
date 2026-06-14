/**
 * /live — "who's exposed today" (pure core).
 *
 * For each of today's WC fixtures, show which of OUR fantasy teams own players
 * from the nations playing, plus a per-team "skin in the game today" tally.
 *
 * This module is pure + DB-free so it's unit-testable. The DB-backed entry
 * point that assembles the ownership index lives in `live-exposure-data.ts`.
 *
 * ANTI-CHEAT (hard requirement): a squad's roster is only public once its round
 * is `locked` or `scored` — identical to the rule in getTeamDetail()/the
 * leaderboard. A round that's still `open`/`upcoming` must NOT have its rosters
 * revealed here, or /live would become a pre-deadline peek-and-copy tool. The
 * builder enforces this via `revealedRounds`: a match whose round isn't in that
 * set renders the fixture but withholds all owners.
 */

import type { Position } from "@/db/schema";
import type { WcMatch, WcTeam } from "@/lib/wc-tournament";

// ─── Public shapes ───────────────────────────────────────────────────────────

export type ExposedPlayer = {
  playerId: string;
  playerName: string;
  position: Position;
  isCaptain: boolean;
};

/** One of our fantasy teams, and the players it owns from a given nation. */
export type TeamExposure = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  players: ExposedPlayer[];
};

/** A nation in today's fixtures + every fantasy team exposed through it. */
export type NationExposure = {
  externalTeamId: number;
  code: string;
  name: string;
  teams: TeamExposure[];
};

export type MatchExposureView = {
  match: WcMatch;
  home: NationExposure | null;
  away: NationExposure | null;
  /** False when the match's round isn't `locked`/`scored` yet — rosters are
   *  withheld (anti-cheat). The fixture still renders. */
  revealed: boolean;
};

export type TeamDailyAggregate = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  /** Distinct owned players in action across all of today's revealed matches. */
  playerCount: number;
  /** Distinct matches this team has any exposure in. */
  matchCount: number;
  /** Σ this-round price growth (SEK) across the team's exposed players. A
   *  nation plays once per round, so a round's growth ≈ that matchday's growth.
   *  Positive = the day's games lifted the team's value, negative = dropped it. */
  growthSek: number;
};

export type LiveExposure = {
  /** Stockholm-local date key the view is built for, e.g. "2026-06-14". */
  dateKey: string;
  matches: MatchExposureView[];
  leaderboard: TeamDailyAggregate[];
  /** True if every match today is from a revealed round. */
  allRevealed: boolean;
};

/** Owner of a player in a specific round (an entry in the ownership index). */
export type OwnerEntry = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  playerId: string;
  playerName: string;
  position: Position;
  isCaptain: boolean;
  /** This-round price growth (SEK) for the player; 0 if no snapshot. */
  growthSek: number;
};

/**
 * Ownership keyed by round number → Aftonbladet team id (the nation) → owners.
 * Should only contain entries for REVEALED rounds; the builder treats a missing
 * round as "not revealed" regardless.
 */
export type OwnershipIndex = Map<number, Map<number, OwnerEntry[]>>;

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * A "match day" is an American calendar day, not a Swedish one. WC 2026 is
 * hosted across the US/Canada/Mexico, so the natural daily slate is anchored to
 * North-American time. We use Pacific specifically: no WC kickoff falls outside
 * a single Pacific calendar day (an evening Eastern game would otherwise spill
 * past local midnight and split the slate across two dates).
 */
const MATCHDAY_TZ = "America/Los_Angeles";

/** "YYYY-MM-DD" for an instant, in the match-day (Pacific) timezone. */
export function matchDayKey(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  // en-CA renders ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MATCHDAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Matches whose kickoff falls on the given match-day key, sorted by kickoff. */
export function matchesOnDay(matches: WcMatch[], dateKey: string): WcMatch[] {
  return matches
    .filter((m) => matchDayKey(m.kickoff) === dateKey)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/** Parse "ab:club:3969" → 3969. null if it doesn't match. */
export function externalClubNumericId(externalId: string | null): number | null {
  if (!externalId) return null;
  const m = externalId.match(/^ab:club:(\d+)$/);
  return m ? Number.parseInt(m[1], 10) : null;
}

const POS_ORDER: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
function sortPlayers(ps: ExposedPlayer[]): void {
  ps.sort(
    (a, b) =>
      POS_ORDER[a.position] - POS_ORDER[b.position] ||
      a.playerName.localeCompare(b.playerName, "sv"),
  );
}

/**
 * Pure exposure builder. Given today's matches, the team lookup, the ownership
 * index (revealed rounds only) and the set of revealed round numbers, produce
 * the per-match exposure + the daily team aggregate.
 */
export function buildExposure(args: {
  matches: WcMatch[];
  teamsById: Map<number, WcTeam>;
  ownership: OwnershipIndex;
  revealedRounds: Set<number>;
  dateKey: string;
}): LiveExposure {
  const { matches, teamsById, ownership, revealedRounds, dateKey } = args;

  // Aggregate state: per fantasy team → set of player ids + set of match ids +
  // running day growth (summed once per distinct player).
  const aggPlayers = new Map<string, Set<string>>();
  const aggMatches = new Map<string, Set<number>>();
  const aggGrowth = new Map<string, number>();
  const aggMeta = new Map<string, { teamName: string; teamSlug: string }>();

  function nationExposure(
    roundNumber: number,
    externalTeamId: number,
    matchId: number,
    revealed: boolean,
  ): NationExposure | null {
    const wcTeam = teamsById.get(externalTeamId);
    if (!wcTeam) return null;
    const base: NationExposure = {
      externalTeamId,
      code: wcTeam.code,
      name: wcTeam.name,
      teams: [],
    };
    if (!revealed) return base;

    const owners = ownership.get(roundNumber)?.get(externalTeamId) ?? [];
    // Group owners by fantasy team.
    const byTeam = new Map<string, TeamExposure>();
    for (const o of owners) {
      let te = byTeam.get(o.teamId);
      if (!te) {
        te = {
          teamId: o.teamId,
          teamName: o.teamName,
          teamSlug: o.teamSlug,
          players: [],
        };
        byTeam.set(o.teamId, te);
      }
      te.players.push({
        playerId: o.playerId,
        playerName: o.playerName,
        position: o.position,
        isCaptain: o.isCaptain,
      });

      // Feed the daily aggregate (distinct players / matches). Growth is summed
      // once per distinct player so a team exposed twice never double-counts.
      if (!aggPlayers.has(o.teamId)) aggPlayers.set(o.teamId, new Set());
      if (!aggMatches.has(o.teamId)) aggMatches.set(o.teamId, new Set());
      const pset = aggPlayers.get(o.teamId)!;
      if (!pset.has(o.playerId)) {
        pset.add(o.playerId);
        aggGrowth.set(o.teamId, (aggGrowth.get(o.teamId) ?? 0) + o.growthSek);
      }
      aggMatches.get(o.teamId)!.add(matchId);
      aggMeta.set(o.teamId, { teamName: o.teamName, teamSlug: o.teamSlug });
    }

    base.teams = [...byTeam.values()].sort(
      (a, b) =>
        b.players.length - a.players.length ||
        a.teamName.localeCompare(b.teamName, "sv"),
    );
    for (const te of base.teams) sortPlayers(te.players);
    return base;
  }

  const matchViews: MatchExposureView[] = matches.map((m) => {
    const revealed = revealedRounds.has(m.roundNumber);
    return {
      match: m,
      revealed,
      home: nationExposure(m.roundNumber, m.homeTeamId, m.externalId, revealed),
      away: nationExposure(m.roundNumber, m.awayTeamId, m.externalId, revealed),
    };
  });

  const leaderboard: TeamDailyAggregate[] = [...aggMeta.entries()]
    .map(([teamId, meta]) => ({
      teamId,
      teamName: meta.teamName,
      teamSlug: meta.teamSlug,
      playerCount: aggPlayers.get(teamId)?.size ?? 0,
      matchCount: aggMatches.get(teamId)?.size ?? 0,
      growthSek: aggGrowth.get(teamId) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.playerCount - a.playerCount ||
        b.matchCount - a.matchCount ||
        a.teamName.localeCompare(b.teamName, "sv"),
    );

  const allRevealed = matches.every((m) => revealedRounds.has(m.roundNumber));

  return { dateKey, matches: matchViews, leaderboard, allRevealed };
}
