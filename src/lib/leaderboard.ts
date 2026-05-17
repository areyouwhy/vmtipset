import { asc, eq, inArray } from "drizzle-orm";
import { clubFor } from "@/data/player-clubs";
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
import { getBetTotalsByTeam } from "./bets-data";
import { currentRules } from "./rules";

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
  /** Owner's user.status. Rejected users are filtered out before this stage,
   *  so it's always pending or approved. */
  ownerStatus: "pending" | "approved";
  /** Sum of Δ team value across all scored rounds. Equals
   *  (current team value − initial budget) once at least one round is scored. */
  totalPointsSek: number;
  perRound: LeaderboardPerRound[];
  /** Sum of awarded points across all scored daily bets — separate pool. */
  dailyBetsPoints: number;
  /** Squad value at current prices: Σ price for the latest squad. null if no squad yet. */
  squadValueSek: number | null;
  /** Bank cash after the latest scored round. budgetSek − initial squad cost
   *  for round 1; modified by interest, captain bonus, transfers afterward. */
  bankSek: number | null;
  /** squadValueSek + bankSek — the metric we rank by. */
  teamValueSek: number | null;
};

export type DailyBetsRow = {
  rank: number;
  teamId: string;
  teamName: string;
  ownerHandle: string;
  pointsTotal: number;
};

export type Leaderboard = {
  rounds: { id: string; number: number; name: string; isScored: boolean }[];
  rows: LeaderboardRow[];
  dailyBets: DailyBetsRow[];
  latestScoredRoundId: string | null;
  /** True once at least one round has been scored. */
  anyScored: boolean;
};

/**
 * Compute the public leaderboard for the main league across all rounds.
 * Rank is by total points across all scored rounds; tied teams share the
 * lower numeric rank (`1, 2, 2, 4`).
 */
export async function getLeaderboard(): Promise<Leaderboard> {
  const [
    allRounds,
    allScores,
    allTeamsRaw,
    allUsers,
    dailyBetsByTeam,
    allSquads,
    allSquadPlayers,
    allSnapshots,
  ] = await Promise.all([
    db.select().from(rounds).orderBy(asc(rounds.number)),
    db.select().from(teamRoundScores),
    db.select().from(teams),
    db.select().from(users),
    getBetTotalsByTeam(),
    db.select().from(squads),
    db.select().from(squadPlayers),
    db.select().from(playerRoundSnapshots),
  ]);

  const userById = new Map(allUsers.map((u) => [u.id, u]));
  // Hide teams whose owner is rejected — they're not in the league.
  // Pending and approved owners both show; pending get an "EJ SWISHAD" tag
  // in the UI.
  const allTeams = allTeamsRaw.filter((t) => {
    const owner = userById.get(t.ownerUserId);
    return owner ? owner.status !== "rejected" : true;
  });
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

  // Squad value: sum of current player prices for the team's most recent
  // squad's round. Manual snapshots win over api when both exist.
  const roundOrderIndex = new Map(allRounds.map((r, i) => [r.id, i] as const));
  const latestSquadByTeam = new Map<string, { roundId: string; squadId: string }>();
  for (const sq of allSquads) {
    const cur = latestSquadByTeam.get(sq.teamId);
    const curIdx = cur ? (roundOrderIndex.get(cur.roundId) ?? -1) : -1;
    const newIdx = roundOrderIndex.get(sq.roundId) ?? -1;
    if (newIdx > curIdx) {
      latestSquadByTeam.set(sq.teamId, { roundId: sq.roundId, squadId: sq.id });
    }
  }
  const playerIdsBySquad = new Map<string, string[]>();
  for (const sp of allSquadPlayers) {
    const arr = playerIdsBySquad.get(sp.squadId) ?? [];
    arr.push(sp.playerId);
    playerIdsBySquad.set(sp.squadId, arr);
  }
  const snapshotByRoundPlayer = new Map<string, number>();
  for (const s of allSnapshots) {
    const key = `${s.roundId}::${s.playerId}`;
    const existing = snapshotByRoundPlayer.get(key);
    if (existing === undefined || s.source === "manual") {
      snapshotByRoundPlayer.set(key, s.priceSek);
    }
  }
  const squadValueByTeam = new Map<string, number | null>();
  for (const t of allTeams) {
    const latest = latestSquadByTeam.get(t.id);
    if (!latest) {
      squadValueByTeam.set(t.id, null);
      continue;
    }
    const pids = playerIdsBySquad.get(latest.squadId) ?? [];
    if (pids.length === 0) {
      squadValueByTeam.set(t.id, null);
      continue;
    }
    let sum = 0;
    let missing = false;
    for (const pid of pids) {
      const price = snapshotByRoundPlayer.get(`${latest.roundId}::${pid}`);
      if (price === undefined) {
        missing = true;
        break;
      }
      sum += price;
    }
    squadValueByTeam.set(t.id, missing ? null : sum);
  }

  // Bank: latest scored round's bank_sek_end. Pre-tournament (no rounds scored)
  // we don't know bank yet, but if a squad exists we can fall back to
  // budgetSek − squad cost at round 1 prices (matches what the engine will use).
  const scoresByTeamRound = new Map<string, TeamRoundScore>();
  for (const s of allScores) scoresByTeamRound.set(`${s.teamId}::${s.roundId}`, s);
  const bankByTeam = new Map<string, number | null>();
  for (const t of allTeams) {
    // Walk scored rounds in reverse to find this team's latest bank_end.
    let bank: number | null = null;
    for (let i = scoredRounds.length - 1; i >= 0; i--) {
      const s = scoresByTeamRound.get(`${t.id}::${scoredRounds[i].id}`);
      if (s) {
        bank = s.bankSekEnd;
        break;
      }
    }
    // No scored rounds yet — derive from round 1 squad if one exists.
    if (bank === null) {
      const latest = latestSquadByTeam.get(t.id);
      if (latest) {
        const pids = playerIdsBySquad.get(latest.squadId) ?? [];
        const cost = pids.reduce(
          (acc, pid) =>
            acc + (snapshotByRoundPlayer.get(`${latest.roundId}::${pid}`) ?? 0),
          0,
        );
        bank = currentRules.budgetSek - cost;
      }
    }
    bankByTeam.set(t.id, bank);
  }

  const teamValueByTeam = new Map<string, number | null>();
  for (const t of allTeams) {
    const sq = squadValueByTeam.get(t.id);
    const bk = bankByTeam.get(t.id);
    teamValueByTeam.set(
      t.id,
      sq === null || sq === undefined || bk === null || bk === undefined
        ? null
        : sq + bk,
    );
  }

  // Rank by team value (squad + bank). This works pre- and post-scoring:
  // before any round is scored everyone's team value = 50M (initial budget),
  // so they tie at rank 1 — exactly what we want.
  const rankingMap = new Map(
    allTeams.map((t) => [t.id, teamValueByTeam.get(t.id) ?? 0] as const),
  );
  const currentRanks = ranksFor(rankingMap);
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

    const ownerStatus = (owner?.status === "approved" ? "approved" : "pending") as
      | "pending"
      | "approved";
    return {
      rank,
      prevRank,
      rankChange,
      teamId: t.id,
      teamName: team.name,
      ownerHandle: handle,
      ownerStatus,
      totalPointsSek: total,
      perRound,
      dailyBetsPoints: dailyBetsByTeam.get(t.id) ?? 0,
      squadValueSek: squadValueByTeam.get(t.id) ?? null,
      bankSek: bankByTeam.get(t.id) ?? null,
      teamValueSek: teamValueByTeam.get(t.id) ?? null,
    };
  });

  rows.sort((a, b) => a.rank - b.rank || b.totalPointsSek - a.totalPointsSek);

  // Separate daily-bets ranking — only tied to the bets pool.
  const dailyBets: DailyBetsRow[] = allTeams
    .map((t) => {
      const owner = userById.get(t.ownerUserId);
      const handle = owner?.displayName || owner?.email.split("@")[0] || "okänd";
      return {
        rank: 0,
        teamId: t.id,
        teamName: t.name,
        ownerHandle: handle,
        pointsTotal: dailyBetsByTeam.get(t.id) ?? 0,
      };
    })
    .filter((r) => r.pointsTotal > 0)
    .sort((a, b) => b.pointsTotal - a.pointsTotal);
  // Assign tied ranks
  let lastPts: number | null = null;
  let lastRank = 0;
  for (let i = 0; i < dailyBets.length; i++) {
    if (dailyBets[i].pointsTotal !== lastPts) {
      lastRank = i + 1;
      lastPts = dailyBets[i].pointsTotal;
    }
    dailyBets[i].rank = lastRank;
  }

  return {
    rounds: allRounds.map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
      isScored: r.status === "scored",
    })),
    rows,
    dailyBets,
    latestScoredRoundId: latestScored?.id ?? null,
    anyScored: scoredRounds.length > 0,
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
  /** Domestic club at WC time (e.g. "Inter Miami CF"). null if unknown. */
  domesticClub: string | null;
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
  /** A squad exists but is hidden from this viewer because the round is
   *  still open/upcoming (anti-cheat). Owners and admins always see their
   *  own squads. */
  squadHidden: boolean;
  score: TeamRoundScore | null;
  players: TeamDetailPlayer[];
  /** Σ priceSek across the squad for this round (= squad market value at that round). */
  squadValueSek: number | null;
  /** Bank cash AT END of this round (from team_round_scores.bank_sek_end). null for
   *  rounds that haven't been scored yet. */
  bankSek: number | null;
  /** squadValueSek + bankSek — what the team was worth at the end of this round.
   *  null if either piece is missing. */
  teamValueSek: number | null;
};

export type TeamDetail = {
  teamId: string;
  teamName: string;
  ownerHandle: string;
  /** Σ Δ team value across all scored rounds = current team value − initial budget. */
  totalPointsSek: number;
  rank: number | null;
  budgetSek: number;
  /** Bank cash after the latest scored round. */
  currentBankSek: number | null;
  /** Squad value at current prices (latest squad). */
  currentSquadValueSek: number | null;
  /** Squad + bank — the ranking metric. */
  currentTeamValueSek: number | null;
  byRound: TeamDetailRoundLine[];
};

export async function getTeamDetail(
  teamId: string,
  opts: { viewerUserId?: string | null; viewerIsAdmin?: boolean } = {},
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

  // Anti-cheat: hide squad contents from anyone who's not the owner (or an
  // admin) while the round is still open/upcoming, so people can't peek at
  // each other's lineups before the deadline.
  const isOwner =
    opts.viewerUserId != null && opts.viewerUserId === team.ownerUserId;
  const canSeeAnySquad = isOwner || opts.viewerIsAdmin === true;

  const byRound: TeamDetailRoundLine[] = allRounds.map((r) => {
    const sq = squadByRound.get(r.id);
    const playerIds = sq ? (playersBySquad.get(sq.id) ?? []) : [];
    const roundIsReleased = r.status === "locked" || r.status === "scored";
    const squadHidden = !!sq && !canSeeAnySquad && !roundIsReleased;
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
          domesticClub: clubFor(p.externalId),
          isCaptain: sq?.captainPlayerId === pid,
          priceSek: snap?.priceSek ?? null,
          // Anti-spoiler: only reveal growth for rounds that have actually
          // happened (locked or scored). Without this, manual snapshots or
          // mid-round Aftonbladet drift would expose round outcomes early.
          growthSek: roundIsReleased ? (snap?.growthSek ?? null) : null,
        },
      ];
    });
    const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
    linePlayers.sort((a, b) => {
      if (order[a.position] !== order[b.position]) {
        return order[a.position] - order[b.position];
      }
      if (a.isCaptain !== b.isCaptain) return a.isCaptain ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    // Squad value = Σ priceSek across the squad. Null if any price missing.
    const hasAnyMissingPrice =
      linePlayers.length === 0 ||
      linePlayers.some((p) => p.priceSek === null);
    const squadValueSek = hasAnyMissingPrice
      ? null
      : linePlayers.reduce((acc, p) => acc + (p.priceSek ?? 0), 0);

    // Bank: from team_round_scores.bank_sek_end of THIS round if scored;
    // otherwise null (we don't know it yet).
    const score = scoreByRound.get(r.id) ?? null;
    const bankSek = score?.bankSekEnd ?? null;
    const teamValueSek =
      squadValueSek !== null && bankSek !== null ? squadValueSek + bankSek : null;

    return {
      roundId: r.id,
      roundNumber: r.number,
      roundName: r.name,
      status: r.status,
      hasSquad: !!sq,
      squadHidden,
      score,
      players: squadHidden ? [] : linePlayers,
      squadValueSek: squadHidden ? null : squadValueSek,
      bankSek: squadHidden ? null : bankSek,
      teamValueSek: squadHidden ? null : teamValueSek,
    };
  });

  // Δ team value across all scored rounds. Equals (current team value − 50M)
  // once any round is scored.
  const total = allScores.reduce((acc, s) => acc + s.totalPointsSek, 0);

  const lb = await getLeaderboard();
  const me = lb.rows.find((row) => row.teamId === teamId);

  const handle =
    owner?.displayName || owner?.email.split("@")[0] || "okänd";

  // "Current" snapshot. Bank comes from the latest scored round; squad value
  // uses the latest squad's prices (which may be a not-yet-scored round, in
  // which case bank is the latest scored round's end balance).
  const latestScoredRound = [...allRounds]
    .reverse()
    .find((r) => r.status === "scored");
  const currentBankSek =
    latestScoredRound !== undefined
      ? (scoreByRound.get(latestScoredRound.id)?.bankSekEnd ?? null)
      : // No round scored yet — derive from round 1 squad if it exists.
        (() => {
          const r1 = allRounds[0];
          if (!r1) return null;
          const r1Sq = squadByRound.get(r1.id);
          if (!r1Sq) return null;
          const r1PlayerIds = playersBySquad.get(r1Sq.id) ?? [];
          let cost = 0;
          let missing = false;
          for (const pid of r1PlayerIds) {
            const price = snapshotByRoundPlayer.get(`${r1.id}::${pid}`)?.priceSek;
            if (price === undefined) {
              missing = true;
              break;
            }
            cost += price;
          }
          return missing ? null : currentRules.budgetSek - cost;
        })();
  const latestWithSquad = [...byRound].reverse().find((l) => l.hasSquad);
  const currentSquadValueSek = latestWithSquad?.squadValueSek ?? null;
  const currentTeamValueSek =
    currentSquadValueSek !== null && currentBankSek !== null
      ? currentSquadValueSek + currentBankSek
      : null;

  return {
    teamId: team.id,
    teamName: team.name,
    ownerHandle: handle,
    totalPointsSek: total,
    rank: me?.rank ?? null,
    budgetSek: currentRules.budgetSek,
    currentBankSek,
    currentSquadValueSek,
    currentTeamValueSek,
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
  /** Σ priceSek for the squad at this round = squad value at round end. */
  squadValueSek: number;
  /** squadValueSek + total.bankSekEnd — total team value at end of this round. */
  teamValueSek: number;
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
      const squadValueSek = perPlayer.reduce((acc, pl) => acc + pl.priceSek, 0);
      return {
        teamId: team.id,
        teamName: team.name,
        ownerHandle: handle,
        total: score,
        perPlayer,
        squadValueSek,
        teamValueSek: squadValueSek + score.bankSekEnd,
      } satisfies AuditTeamLine;
    })
    .filter((x): x is AuditTeamLine => x !== null)
    .sort((a, b) => b.teamValueSek - a.teamValueSek);

  return { round, teams: teamsLines };
}
