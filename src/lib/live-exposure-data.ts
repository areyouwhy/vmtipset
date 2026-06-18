/**
 * /live — DB-backed assembly of the live-exposure view.
 *
 * Read-only: fixtures come live from Aftonbladet (wc-tournament.ts), ownership
 * from the DB. Nothing here writes. The anti-cheat reveal gate is enforced here
 * by only loading squads for `locked`/`scored` rounds and passing the matching
 * `revealedRounds` set into the pure builder.
 */

import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  clubs,
  playerRoundSnapshots,
  players,
  rounds,
  squadPlayers,
  squads,
  teams,
} from "@/db/schema";
import { getRejectedTeamIds } from "@/lib/active-teams";
import { teamSlug } from "@/lib/team-slug";
import {
  buildExposure,
  externalClubNumericId,
  matchDayKey,
  matchesOnDay,
  type LiveExposure,
  type OwnershipIndex,
} from "@/lib/live-exposure";
import { getAllMatches, getTeamLookup, type WcMatch } from "@/lib/wc-tournament";

/** The exposure view for one day, plus the navigation context around it. */
export type LiveView = LiveExposure & {
  /** All match-day keys that have fixtures, ascending. */
  days: string[];
  /** Adjacent days that have fixtures (null at the ends). */
  prevDay: string | null;
  nextDay: string | null;
  /** Today's match-day key (Pacific), whether or not it has fixtures. */
  todayKey: string;
  /** True when the rendered day is the current match day. */
  isToday: boolean;
};

/** Pick a sensible default day: today if it has games, else the next upcoming
 *  day with games, else the most recent one. */
function pickDefaultDay(days: string[], todayKey: string): string {
  if (days.length === 0) return todayKey;
  if (days.includes(todayKey)) return todayKey;
  const upcoming = days.find((d) => d > todayKey);
  return upcoming ?? days[days.length - 1];
}

/** Load ownership for the revealed rounds among `todays`. Empty if none. */
async function loadOwnership(
  todays: WcMatch[],
): Promise<{ ownership: OwnershipIndex; revealedRounds: Set<number> }> {
  const ownership: OwnershipIndex = new Map();
  const revealedRounds = new Set<number>();
  if (todays.length === 0) return { ownership, revealedRounds };

  const roundNumbers = [...new Set(todays.map((m) => m.roundNumber))];
  const roundRows = await db
    .select()
    .from(rounds)
    .where(inArray(rounds.number, roundNumbers));

  const revealedRoundIdToNumber = new Map<string, number>();
  for (const r of roundRows) {
    if (r.status === "locked" || r.status === "scored") {
      revealedRounds.add(r.number);
      revealedRoundIdToNumber.set(r.id, r.number);
    }
  }
  if (revealedRoundIdToNumber.size === 0) return { ownership, revealedRounds };

  const revealedRoundIds = [...revealedRoundIdToNumber.keys()];
  const [squadRowsRaw, clubRows, teamRows, snapRows, rejected] =
    await Promise.all([
      db.select().from(squads).where(inArray(squads.roundId, revealedRoundIds)),
      db.select().from(clubs),
      db.select().from(teams).orderBy(asc(teams.name)),
      db
        .select({
          roundId: playerRoundSnapshots.roundId,
          playerId: playerRoundSnapshots.playerId,
          growthSek: playerRoundSnapshots.growthSek,
          source: playerRoundSnapshots.source,
        })
        .from(playerRoundSnapshots)
        .where(inArray(playerRoundSnapshots.roundId, revealedRoundIds)),
      getRejectedTeamIds(),
    ]);
  // Rejected owners aren't in the league — exclude their squads from exposure.
  const squadRows = squadRowsRaw.filter((s) => !rejected.has(s.teamId));

  // (round|player) → growthSek, preferring manual over api (repo convention).
  const growthByKey = new Map<string, number>();
  const sourceByKey = new Map<string, string>();
  for (const s of snapRows) {
    const key = `${s.roundId}|${s.playerId}`;
    if (!sourceByKey.has(key) || s.source === "manual") {
      growthByKey.set(key, s.growthSek);
      sourceByKey.set(key, s.source);
    }
  }

  const teamById = new Map(teamRows.map((t) => [t.id, t]));
  // club.id → nation external numeric id (the Aftonbladet team id).
  const clubNationId = new Map<string, number>();
  for (const c of clubRows) {
    const num = externalClubNumericId(c.externalId);
    if (num !== null) clubNationId.set(c.id, num);
  }

  const squadIds = squadRows.map((s) => s.id);
  const spRows =
    squadIds.length > 0
      ? await db
          .select()
          .from(squadPlayers)
          .where(inArray(squadPlayers.squadId, squadIds))
      : [];
  const playerIds = [...new Set(spRows.map((sp) => sp.playerId))];
  const playerRows =
    playerIds.length > 0
      ? await db.select().from(players).where(inArray(players.id, playerIds))
      : [];
  const playerById = new Map(playerRows.map((p) => [p.id, p]));
  const squadById = new Map(squadRows.map((s) => [s.id, s]));

  for (const sp of spRows) {
    const squad = squadById.get(sp.squadId);
    if (!squad) continue;
    const roundNumber = revealedRoundIdToNumber.get(squad.roundId);
    if (roundNumber === undefined) continue;
    const player = playerById.get(sp.playerId);
    if (!player || !player.clubId) continue;
    const nationId = clubNationId.get(player.clubId);
    if (nationId === undefined) continue;
    const team = teamById.get(squad.teamId);
    if (!team) continue;

    let byNation = ownership.get(roundNumber);
    if (!byNation) {
      byNation = new Map();
      ownership.set(roundNumber, byNation);
    }
    const arr = byNation.get(nationId) ?? [];
    arr.push({
      teamId: team.id,
      teamName: team.name,
      teamSlug: teamSlug(team.name),
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      isCaptain: squad.captainPlayerId === player.id,
      growthSek: growthByKey.get(`${squad.roundId}|${player.id}`) ?? 0,
    });
    byNation.set(nationId, arr);
  }

  return { ownership, revealedRounds };
}

/**
 * Build the live-exposure view for a target match day (defaults to the current
 * one), with prev/next navigation across days that have fixtures. Fetches
 * fixtures live; reads ownership from the DB for the target day's revealed
 * rounds only.
 */
export async function getLiveView(
  targetDateKey?: string,
  now: Date = new Date(),
): Promise<LiveView> {
  const [allMatches, teamsById] = await Promise.all([
    getAllMatches(),
    getTeamLookup(),
  ]);

  const days = [...new Set(allMatches.map((m) => matchDayKey(m.kickoff)))].sort();
  const todayKey = matchDayKey(now);

  const dateKey =
    targetDateKey && days.includes(targetDateKey)
      ? targetDateKey
      : pickDefaultDay(days, todayKey);

  const idx = days.indexOf(dateKey);
  const prevDay = idx > 0 ? days[idx - 1] : null;
  const nextDay = idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null;

  const todays = matchesOnDay(allMatches, dateKey);
  const { ownership, revealedRounds } = await loadOwnership(todays);

  const exposure = buildExposure({
    matches: todays,
    teamsById,
    ownership,
    revealedRounds,
    dateKey,
  });

  return {
    ...exposure,
    days,
    prevDay,
    nextDay,
    todayKey,
    isToday: dateKey === todayKey,
  };
}
