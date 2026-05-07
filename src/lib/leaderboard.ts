import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  clubs,
  playerRoundSnapshots,
  players,
  rounds,
  squadPlayers,
  squads,
  teamRoundScores,
  teams,
  users,
  type Round,
  type TeamRoundScore,
} from "@/db/schema";

export type LeaderboardPerRound = {
  roundId: string;
  roundNumber: number;
  roundName: string;
  pointsSek: number | null; // null = round not scored or team didn't have a squad
};

export type LeaderboardRow = {
  rank: number;
  prevRank: number | null;
  rankChange: number | null; // positive = climbed, negative = fell
  teamId: string;
  teamName: string;
  ownerHandle: string;
  totalPointsSek: number;
  perRound: LeaderboardPerRound[];
};

export type Leaderboard = {
  rounds: { id: string; number: number; name: string; isScored: boolean }[];
  rows: LeaderboardRow[];
  latestScoredRoundId: string | null;
};

/**
 * Compute the public leaderboard for the main league across all rounds.
 * Rank is by total points across all scored rounds; tied teams share the
 * lower numeric rank (`1, 2, 2, 4`).
 */
export async function getLeaderboard(): Promise<Leaderboard> {
  const [allRounds, allScores, allTeams, allUsers] = await Promise.all([
    db.select().from(rounds).orderBy(asc(rounds.number)),
    db.select().from(teamRoundScores),
    db.select().from(teams),
    db.select().from(users),
  ]);

  const userById = new Map(allUsers.map((u) => [u.id, u]));
  const teamById = new Map(allTeams.map((t) => [t.id, t]));

  const scoredRounds = allRounds.filter((r) => r.status === "scored");
  const latestScored = scoredRounds.at(-1) ?? null;

  // points per (team, round)
  const pointsByTeamRound = new Map<string, number>();
  for (const s of allScores) {
    pointsByTeamRound.set(`${s.teamId}::${s.roundId}`, s.totalPointsSek);
  }

  // Totals per team across ALL scored rounds
  const totalByTeam = new Map<string, number>();
  for (const t of allTeams) {
    let total = 0;
    for (const r of scoredRounds) {
      total += pointsByTeamRound.get(`${t.id}::${r.id}`) ?? 0;
    }
    totalByTeam.set(t.id, total);
  }

  // Totals UP TO previous round (for rank-change arrows)
  const previousScoredRounds = scoredRounds.slice(0, -1);
  const prevTotalByTeam = new Map<string, number>();
  for (const t of allTeams) {
    let total = 0;
    for (const r of previousScoredRounds) {
      total += pointsByTeamRound.get(`${t.id}::${r.id}`) ?? 0;
    }
    prevTotalByTeam.set(t.id, total);
  }

  const ranksFor = (totals: Map<string, number>) => {
    const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const ranks = new Map<string, number>();
    let lastPoints: number | null = null;
    let lastRank = 0;
    for (let i = 0; i < entries.length; i++) {
      const [id, pts] = entries[i];
      if (pts !== lastPoints) {
        lastRank = i + 1;
        lastPoints = pts;
      }
      ranks.set(id, lastRank);
    }
    return ranks;
  };

  const currentRanks = ranksFor(totalByTeam);
  const prevRanks =
    previousScoredRounds.length > 0 ? ranksFor(prevTotalByTeam) : null;

  const rows: LeaderboardRow[] = allTeams.map((t) => {
    const team = teamById.get(t.id)!;
    const owner = userById.get(team.ownerUserId);
    const handle =
      owner?.displayName || owner?.email.split("@")[0] || "okänd";
    const total = totalByTeam.get(t.id) ?? 0;
    const rank = currentRanks.get(t.id) ?? allTeams.length;
    const prevRank = prevRanks?.get(t.id) ?? null;
    const rankChange = prevRank !== null ? prevRank - rank : null;

    const perRound: LeaderboardPerRound[] = allRounds.map((r) => ({
      roundId: r.id,
      roundNumber: r.number,
      roundName: r.name,
      pointsSek:
        r.status === "scored"
          ? (pointsByTeamRound.get(`${t.id}::${r.id}`) ?? null)
          : null,
    }));

    return {
      rank,
      prevRank,
      rankChange,
      teamId: t.id,
      teamName: team.name,
      ownerHandle: handle,
      totalPointsSek: total,
      perRound,
    };
  });

  rows.sort((a, b) => a.rank - b.rank || b.totalPointsSek - a.totalPointsSek);

  return {
    rounds: allRounds.map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
      isScored: r.status === "scored",
    })),
    rows,
    latestScoredRoundId: latestScored?.id ?? null,
  };
}

// ─── Team detail ────────────────────────────────────────────────────────────

export type TeamDetailPlayer = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  clubName: string;
  clubShortName: string;
  countryCode: string | null;
  isCaptain: boolean;
  priceSek: number | null;
  growthSek: number | null;
};

export type TeamDetailRoundLine = {
  roundId: string;
  roundNumber: number;
  roundName: string;
  status: "upcoming" | "open" | "locked" | "scored";
  hasSquad: boolean;
  score: TeamRoundScore | null;
  players: TeamDetailPlayer[];
};

export type TeamDetail = {
  teamId: string;
  teamName: string;
  ownerHandle: string;
  totalPointsSek: number;
  rank: number | null;
  byRound: TeamDetailRoundLine[];
};

export async function getTeamDetail(
  teamId: string,
): Promise<TeamDetail | null> {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return null;

  const [allRounds, owner, allSquads, allSquadPlayers, allPlayers, allClubs, allSnapshots, allScores] =
    await Promise.all([
      db.select().from(rounds).orderBy(asc(rounds.number)),
      db
        .select()
        .from(users)
        .where(eq(users.id, team.ownerUserId))
        .limit(1)
        .then((r) => r[0] ?? null),
      db.select().from(squads).where(eq(squads.teamId, teamId)),
      db
        .select()
        .from(squadPlayers)
        .where(
          inArray(
            squadPlayers.squadId,
            (
              await db.select({ id: squads.id }).from(squads).where(eq(squads.teamId, teamId))
            ).map((s) => s.id),
          ),
        ),
      db.select().from(players),
      db.select().from(clubs),
      db.select().from(playerRoundSnapshots),
      db
        .select()
        .from(teamRoundScores)
        .where(eq(teamRoundScores.teamId, teamId)),
    ]);

  const playerById = new Map(allPlayers.map((p) => [p.id, p]));
  const clubById = new Map(allClubs.map((c) => [c.id, c]));
  const squadByRound = new Map(allSquads.map((s) => [s.roundId, s]));
  const scoreByRound = new Map(allScores.map((s) => [s.roundId, s]));

  // Build snapshot lookup for whichever round we're rendering, prefer manual
  const snapshotByRoundPlayer = new Map<string, { priceSek: number; growthSek: number; source: "api" | "manual" }>();
  for (const s of allSnapshots) {
    const key = `${s.roundId}::${s.playerId}`;
    const existing = snapshotByRoundPlayer.get(key);
    if (!existing || (existing.source === "api" && s.source === "manual")) {
      snapshotByRoundPlayer.set(key, {
        priceSek: s.priceSek,
        growthSek: s.growthSek,
        source: s.source,
      });
    }
  }

  const playersBySquad = new Map<string, string[]>();
  for (const sp of allSquadPlayers) {
    const arr = playersBySquad.get(sp.squadId) ?? [];
    arr.push(sp.playerId);
    playersBySquad.set(sp.squadId, arr);
  }

  const byRound: TeamDetailRoundLine[] = allRounds.map((r) => {
    const sq = squadByRound.get(r.id);
    const playerIds = sq ? (playersBySquad.get(sq.id) ?? []) : [];
    const linePlayers: TeamDetailPlayer[] = playerIds.flatMap((pid) => {
      const p = playerById.get(pid);
      if (!p) return [];
      const club = p.clubId ? clubById.get(p.clubId) : null;
      const snap = snapshotByRoundPlayer.get(`${r.id}::${pid}`);
      return [
        {
          id: p.id,
          name: p.name,
          position: p.position,
          clubName: club?.name ?? "—",
          clubShortName: club?.shortName ?? club?.name ?? "—",
          countryCode: club?.countryCode ?? null,
          isCaptain: sq?.captainPlayerId === pid,
          priceSek: snap?.priceSek ?? null,
          growthSek: snap?.growthSek ?? null,
        },
      ];
    });
    // Sort: GK, DEF, MID, FWD; captain first within position
    const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
    linePlayers.sort((a, b) => {
      if (order[a.position] !== order[b.position]) {
        return order[a.position] - order[b.position];
      }
      if (a.isCaptain !== b.isCaptain) return a.isCaptain ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return {
      roundId: r.id,
      roundNumber: r.number,
      roundName: r.name,
      status: r.status,
      hasSquad: !!sq,
      score: scoreByRound.get(r.id) ?? null,
      players: linePlayers,
    };
  });

  const total = allScores.reduce((acc, s) => acc + s.totalPointsSek, 0);

  // Rank from leaderboard
  const lb = await getLeaderboard();
  const me = lb.rows.find((row) => row.teamId === teamId);

  const handle =
    owner?.displayName || owner?.email.split("@")[0] || "okänd";

  return {
    teamId: team.id,
    teamName: team.name,
    ownerHandle: handle,
    totalPointsSek: total,
    rank: me?.rank ?? null,
    byRound,
  };
}

// ─── Audit trail ────────────────────────────────────────────────────────────

export type AuditPlayerLine = {
  playerId: string;
  playerName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  countryCode: string | null;
  snapshotId: string;
  priceSek: number;
  growthSek: number;
  isCaptain: boolean;
};

export type AuditTeamLine = {
  teamId: string;
  teamName: string;
  ownerHandle: string;
  total: TeamRoundScore;
  perPlayer: AuditPlayerLine[];
};

export type RoundAudit = {
  round: Round;
  teams: AuditTeamLine[];
};

export async function getRoundAudit(roundId: string): Promise<RoundAudit | null> {
  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);
  if (!round) return null;

  const [allScores, allTeams, allUsers, allSquads, allSquadPlayers, allPlayers, allClubs, allSnapshots] = await Promise.all([
    db.select().from(teamRoundScores).where(eq(teamRoundScores.roundId, roundId)),
    db.select().from(teams),
    db.select().from(users),
    db.select().from(squads).where(eq(squads.roundId, roundId)),
    db.select().from(squadPlayers),
    db.select().from(players),
    db.select().from(clubs),
    db.select().from(playerRoundSnapshots).where(eq(playerRoundSnapshots.roundId, roundId)),
  ]);

  const teamById = new Map(allTeams.map((t) => [t.id, t]));
  const userById = new Map(allUsers.map((u) => [u.id, u]));
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));
  const clubById = new Map(allClubs.map((c) => [c.id, c]));
  const squadByTeam = new Map(allSquads.map((s) => [s.teamId, s]));

  const playersBySquad = new Map<string, string[]>();
  for (const sp of allSquadPlayers) {
    const arr = playersBySquad.get(sp.squadId) ?? [];
    arr.push(sp.playerId);
    playersBySquad.set(sp.squadId, arr);
  }

  const snapshotByPlayer = new Map<string, { id: string; priceSek: number; growthSek: number; source: "api" | "manual" }>();
  for (const s of allSnapshots) {
    const existing = snapshotByPlayer.get(s.playerId);
    if (!existing || (existing.source === "api" && s.source === "manual")) {
      snapshotByPlayer.set(s.playerId, { id: s.id, priceSek: s.priceSek, growthSek: s.growthSek, source: s.source });
    }
  }

  const teamsLines: AuditTeamLine[] = allScores
    .map((score) => {
      const team = teamById.get(score.teamId);
      if (!team) return null;
      const user = userById.get(team.ownerUserId);
      const handle = user?.displayName || user?.email.split("@")[0] || "okänd";
      const sq = squadByTeam.get(score.teamId);
      const playerIds = sq ? (playersBySquad.get(sq.id) ?? []) : [];
      const perPlayer: AuditPlayerLine[] = playerIds.flatMap((pid) => {
        const p = playerById.get(pid);
        if (!p) return [];
        const club = p.clubId ? clubById.get(p.clubId) : null;
        const snap = snapshotByPlayer.get(pid);
        if (!snap) return [];
        return [
          {
            playerId: pid,
            playerName: p.name,
            position: p.position,
            countryCode: club?.countryCode ?? null,
            snapshotId: snap.id,
            priceSek: snap.priceSek,
            growthSek: snap.growthSek,
            isCaptain: sq?.captainPlayerId === pid,
          },
        ];
      });
      return {
        teamId: team.id,
        teamName: team.name,
        ownerHandle: handle,
        total: score,
        perPlayer,
      } satisfies AuditTeamLine;
    })
    .filter((x): x is AuditTeamLine => x !== null)
    .sort((a, b) => b.total.totalPointsSek - a.total.totalPointsSek);

  return { round, teams: teamsLines };
}
