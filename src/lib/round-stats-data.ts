/**
 * DB-backed assembly of /vm/omgang/[n] round statistics + lineup previews.
 *
 * Read-only. Gated on round status: ownership stats reveal aggregate picks and
 * growth is only meaningful after matches play, so we only return data for
 * `locked`/`scored` rounds (mirrors the leaderboard reveal rule).
 */

import { asc, eq, inArray } from "drizzle-orm";
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
import { teamSlug } from "@/lib/team-slug";
import {
  buildOptimalEleven,
  elevenFromSquad,
  roundPerformanceSek,
  type RoundEleven,
  type RoundStatPlayer,
} from "@/lib/round-stats";

export type TopPick = { player: RoundStatPlayer; count: number };
export type TopCountry = {
  countryCode: string | null;
  name: string;
  count: number;
};

export type RoundStats = {
  topPlayer: TopPick | null;
  topCaptain: TopPick | null;
  topCountry: TopCountry | null;
  bestPick: RoundStatPlayer | null;
  worstPick: RoundStatPlayer | null;
  bestCaptainPick: TopPick | null;
};

export type LineupOption = {
  key: "bestLeague" | "bestPossible" | "worstPossible" | "worstLeague";
  label: string;
  /** Team name, or a description for the optimal/nightmare XIs. */
  sublabel: string;
  /** Link target for real teams (the public team page); null for dream XIs. */
  href: string | null;
  eleven: RoundEleven;
};

export type RoundStatsResult =
  | { available: false; roundNumber: number; status: string | null }
  | {
      available: true;
      roundNumber: number;
      stats: RoundStats;
      lineups: LineupOption[];
    };

export async function getRoundStats(
  roundNumber: number,
): Promise<RoundStatsResult> {
  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.number, roundNumber))
    .limit(1);

  if (!round || (round.status !== "locked" && round.status !== "scored")) {
    return { available: false, roundNumber, status: round?.status ?? null };
  }

  const [snapRows, squadRows, allPlayers, allClubs, allTeams] =
    await Promise.all([
      db
        .select()
        .from(playerRoundSnapshots)
        .where(eq(playerRoundSnapshots.roundId, round.id)),
      db.select().from(squads).where(eq(squads.roundId, round.id)),
      db.select().from(players),
      db.select().from(clubs),
      db.select().from(teams).orderBy(asc(teams.name)),
    ]);

  const clubById = new Map(allClubs.map((c) => [c.id, c]));
  const teamById = new Map(allTeams.map((t) => [t.id, t]));

  // manual snapshot wins over api for the same (round, player).
  const snapByPlayer = new Map<string, { priceSek: number; growthSek: number }>();
  const snapSource = new Map<string, string>();
  for (const s of snapRows) {
    if (!snapSource.has(s.playerId) || s.source === "manual") {
      snapByPlayer.set(s.playerId, {
        priceSek: s.priceSek,
        growthSek: s.growthSek,
      });
      snapSource.set(s.playerId, s.source);
    }
  }

  // RoundStatPlayer for every player that has a snapshot this round.
  const statPlayerById = new Map<string, RoundStatPlayer>();
  for (const p of allPlayers) {
    const snap = snapByPlayer.get(p.id);
    if (!snap) continue;
    const club = p.clubId ? clubById.get(p.clubId) : null;
    statPlayerById.set(p.id, {
      id: p.id,
      name: p.name,
      position: p.position,
      countryCode: club?.countryCode ?? null,
      growthSek: snap.growthSek,
      priceSek: snap.priceSek,
    });
  }
  const allRoundPlayers = [...statPlayerById.values()];

  // ── Ownership across our round-n squads ────────────────────────────────────
  const squadIds = squadRows.map((s) => s.id);
  const spRows =
    squadIds.length > 0
      ? await db
          .select()
          .from(squadPlayers)
          .where(inArray(squadPlayers.squadId, squadIds))
      : [];
  const playersBySquad = new Map<string, string[]>();
  for (const sp of spRows) {
    const arr = playersBySquad.get(sp.squadId) ?? [];
    arr.push(sp.playerId);
    playersBySquad.set(sp.squadId, arr);
  }

  const pickCount = new Map<string, number>();
  const captainCount = new Map<string, number>();
  const countryCount = new Map<string, { name: string; count: number }>();
  for (const sq of squadRows) {
    for (const pid of playersBySquad.get(sq.id) ?? []) {
      pickCount.set(pid, (pickCount.get(pid) ?? 0) + 1);
      const sp = statPlayerById.get(pid);
      const code = sp?.countryCode ?? null;
      if (code) {
        const club = allPlayers.find((p) => p.id === pid)?.clubId;
        const name = club ? (clubById.get(club)?.name ?? code) : code;
        const cur = countryCount.get(code) ?? { name, count: 0 };
        cur.count += 1;
        countryCount.set(code, cur);
      }
    }
    if (sq.captainPlayerId) {
      captainCount.set(
        sq.captainPlayerId,
        (captainCount.get(sq.captainPlayerId) ?? 0) + 1,
      );
    }
  }

  const topPick = (counts: Map<string, number>): TopPick | null => {
    let best: TopPick | null = null;
    for (const [pid, count] of counts) {
      const player = statPlayerById.get(pid);
      if (!player) continue;
      if (!best || count > best.count) best = { player, count };
    }
    return best;
  };

  const topPlayer = topPick(pickCount);
  const topCaptain = topPick(captainCount);

  let topCountry: TopCountry | null = null;
  for (const [code, { name, count }] of countryCount) {
    if (!topCountry || count > topCountry.count) {
      topCountry = { countryCode: code, name, count };
    }
  }

  // best/worst pick = highest/lowest growth among players OWNED by ≥1 team.
  const ownedPlayers = [...pickCount.keys()]
    .map((pid) => statPlayerById.get(pid))
    .filter((p): p is RoundStatPlayer => p !== undefined);
  const bestPick = maxBy(ownedPlayers, (p) => p.growthSek);
  const worstPick = minBy(ownedPlayers, (p) => p.growthSek);

  // best captain pick = the chosen captain with the highest growth.
  let bestCaptainPick: TopPick | null = null;
  for (const [pid, count] of captainCount) {
    const player = statPlayerById.get(pid);
    if (!player) continue;
    if (!bestCaptainPick || player.growthSek > bestCaptainPick.player.growthSek) {
      bestCaptainPick = { player, count };
    }
  }

  // ── Lineup previews ────────────────────────────────────────────────────────
  const bestPossible = buildOptimalEleven(allRoundPlayers, "max");
  const worstPossible = buildOptimalEleven(allRoundPlayers, "min");

  // Real teams ranked by round performance (Σ growth + captain bonus).
  const teamLineups = squadRows
    .map((sq) => {
      const pids = playersBySquad.get(sq.id) ?? [];
      const roster = pids
        .map((pid) => statPlayerById.get(pid))
        .filter((p): p is RoundStatPlayer => p !== undefined);
      if (roster.length === 0) return null;
      const perf = roundPerformanceSek(roster, sq.captainPlayerId);
      return { sq, roster, perf };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const bestTeam = maxBy(teamLineups, (t) => t.perf);
  const worstTeam = minBy(teamLineups, (t) => t.perf);

  const lineups: LineupOption[] = [];
  if (bestTeam) {
    const t = teamById.get(bestTeam.sq.teamId);
    lineups.push({
      key: "bestLeague",
      label: "BÄSTA LAGET",
      sublabel: t?.name ?? "—",
      href: t ? `/team/${teamSlug(t.name)}` : null,
      eleven: elevenFromSquad(bestTeam.roster, bestTeam.sq.captainPlayerId),
    });
  }
  if (bestPossible) {
    lineups.push({
      key: "bestPossible",
      label: "BÄSTA MÖJLIGA XI",
      sublabel: "Drömlaget — högst tillväxt",
      href: null,
      eleven: bestPossible,
    });
  }
  if (worstPossible) {
    lineups.push({
      key: "worstPossible",
      label: "SÄMSTA MÖJLIGA XI",
      sublabel: "Mardrömslaget — lägst tillväxt",
      href: null,
      eleven: worstPossible,
    });
  }
  if (worstTeam) {
    const t = teamById.get(worstTeam.sq.teamId);
    lineups.push({
      key: "worstLeague",
      label: "SÄMSTA LAGET",
      sublabel: t?.name ?? "—",
      href: t ? `/team/${teamSlug(t.name)}` : null,
      eleven: elevenFromSquad(worstTeam.roster, worstTeam.sq.captainPlayerId),
    });
  }

  return {
    available: true,
    roundNumber,
    stats: {
      topPlayer,
      topCaptain,
      topCountry,
      bestPick,
      worstPick,
      bestCaptainPick,
    },
    lineups,
  };
}

function maxBy<T>(xs: T[], f: (x: T) => number): T | null {
  let best: T | null = null;
  let bestV = -Infinity;
  for (const x of xs) {
    const v = f(x);
    if (v > bestV) {
      bestV = v;
      best = x;
    }
  }
  return best;
}

function minBy<T>(xs: T[], f: (x: T) => number): T | null {
  let best: T | null = null;
  let bestV = Infinity;
  for (const x of xs) {
    const v = f(x);
    if (v < bestV) {
      bestV = v;
      best = x;
    }
  }
  return best;
}
