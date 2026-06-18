import { asc, eq, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
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
  transfers,
  users,
  type Round,
  type TeamRoundScore,
} from "@/db/schema";
import { getBetTotalsByTeam } from "./bets-data";
import { currentRules } from "./rules";
import { bankInterestSek, captainBonusSek } from "./scoring";

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
  /** Growth this round = Σ growthSek across the latest squad (the value the
   *  squad has gained from price drift). null if no squad yet. */
  roundGrowthSek: number | null;
  /** Bank cash after the latest scored round. budgetSek − initial squad cost
   *  for round 1; modified by interest, captain bonus, transfers afterward.
   *  For an in-progress (unscored) latest round this is the PROJECTED bank end
   *  — it already includes the live captain-bonus + interest projection below,
   *  so `squadValueSek + bankSek = teamValueSek` always holds. */
  bankSek: number | null;
  /** squadValueSek + bankSek — the metric we rank by. */
  teamValueSek: number | null;
  /** Live projection of this round's captain bonus, folded into bank/value
   *  before the round is scored (0 once scored, or when no captain/growth). */
  captainBonusProjectedSek: number;
  /** Live projection of this round's bank interest, folded into bank/value
   *  before the round is scored (0 once scored). */
  bankInterestProjectedSek: number;
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
export const getLeaderboard = unstable_cache(
  _getLeaderboard,
  ["leaderboard"],
  { tags: ["leaderboard", "teams", "scores", "squads"], revalidate: 300 },
);

async function _getLeaderboard(): Promise<Leaderboard> {
  const [
    allRounds,
    allScores,
    allTeamsRaw,
    allUsers,
    dailyBetsByTeam,
    allSquads,
    allSquadPlayers,
    allSnapshots,
    allTransfers,
  ] = await Promise.all([
    db.select().from(rounds).orderBy(asc(rounds.number)),
    db.select().from(teamRoundScores),
    db.select().from(teams),
    db.select().from(users),
    getBetTotalsByTeam(),
    db.select().from(squads),
    db.select().from(squadPlayers),
    db.select().from(playerRoundSnapshots),
    db.select().from(transfers),
  ]);

  // Net transfer cash flow per (team, round): Σ(sell − buy − fee). For an
  // in-progress (unscored) round this hasn't hit any bank_end yet, so the
  // projection must fold it in — otherwise buying a pricier player inflates
  // squad value without the matching cash leaving the bank.
  const cashFlowByTeamRound = new Map<string, number>();
  for (const tr of allTransfers) {
    const key = `${tr.teamId}::${tr.roundId}`;
    cashFlowByTeamRound.set(
      key,
      (cashFlowByTeamRound.get(key) ?? 0) +
        (tr.sellPriceSek - tr.buyPriceSek - tr.feeSek),
    );
  }

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
  const snapshotByRoundPlayer = new Map<
    string,
    { priceSek: number; growthSek: number }
  >();
  for (const s of allSnapshots) {
    const key = `${s.roundId}::${s.playerId}`;
    const existing = snapshotByRoundPlayer.get(key);
    if (existing === undefined || s.source === "manual") {
      snapshotByRoundPlayer.set(key, {
        priceSek: s.priceSek,
        growthSek: s.growthSek,
      });
    }
  }
  const squadValueByTeam = new Map<string, number | null>();
  // Growth this round = Σ growthSek across the latest squad. It's the slice of
  // the squad value that came from in-round price drift (squad value − cost).
  const roundGrowthByTeam = new Map<string, number | null>();
  for (const t of allTeams) {
    const latest = latestSquadByTeam.get(t.id);
    if (!latest) {
      squadValueByTeam.set(t.id, null);
      roundGrowthByTeam.set(t.id, null);
      continue;
    }
    const pids = playerIdsBySquad.get(latest.squadId) ?? [];
    if (pids.length === 0) {
      squadValueByTeam.set(t.id, null);
      roundGrowthByTeam.set(t.id, null);
      continue;
    }
    let sum = 0;
    let growth = 0;
    let missing = false;
    for (const pid of pids) {
      const snap = snapshotByRoundPlayer.get(`${latest.roundId}::${pid}`);
      if (snap === undefined) {
        missing = true;
        break;
      }
      // Squad VALUE uses the current price (this is the drift we want to show).
      sum += snap.priceSek;
      growth += snap.growthSek;
    }
    squadValueByTeam.set(t.id, missing ? null : sum);
    roundGrowthByTeam.set(t.id, missing ? null : growth);
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
        // Bank = budget − what the squad COST (purchase price = current
        // price minus in-round growth), never the current value.
        const cost = pids.reduce((acc, pid) => {
          const snap = snapshotByRoundPlayer.get(`${latest.roundId}::${pid}`);
          return acc + (snap ? snap.priceSek - snap.growthSek : 0);
        }, 0);
        bank = currentRules.budgetSek - cost;
      }
    }
    bankByTeam.set(t.id, bank);
  }

  // ── Live projection of THIS round's captain bonus + bank interest ──────────
  // While a round is in progress (latest squad's round not yet `scored`), the
  // captain bonus and interest haven't been banked. Project them from the live
  // snapshots so the table value/ranking reflect what scoring WILL produce —
  // without scoring (snapshots untouched). Skipped once the round is `scored`,
  // where the real figures already live in bank_sek_end (no double-count).
  // NOTE: exact for Round 1 (no transfers). From Round 2+, `bank` here doesn't
  // yet fold in the current round's pending transfer cash flow, so the interest
  // base — and thus the projection — would need that added; revisit then.
  const roundStatusById = new Map(allRounds.map((r) => [r.id, r.status]));
  const captainBySquad = new Map(
    allSquads.map((sq) => [sq.id, sq.captainPlayerId] as const),
  );
  const captainProjByTeam = new Map<string, number>();
  const interestProjByTeam = new Map<string, number>();
  for (const t of allTeams) {
    const latest = latestSquadByTeam.get(t.id);
    const bank = bankByTeam.get(t.id);
    if (!latest || bank === null || bank === undefined) continue;
    if (roundStatusById.get(latest.roundId) === "scored") continue;

    const captainId = captainBySquad.get(latest.squadId);
    const capSnap = captainId
      ? snapshotByRoundPlayer.get(`${latest.roundId}::${captainId}`)
      : undefined;
    const captainProj = capSnap
      ? captainBonusSek(
          capSnap.growthSek,
          currentRules.captainMultiplier,
          currentRules.captainBonusOnlyPositive,
        )
      : 0;
    // Bank entering this round = prior bank_end + this round's transfer cash
    // flow (sell − buy − fee). Interest is on that entering balance.
    const cashFlow = cashFlowByTeamRound.get(`${t.id}::${latest.roundId}`) ?? 0;
    const bankEntering = bank + cashFlow;
    const interestProj = bankInterestSek(
      bankEntering,
      currentRules.bankInterestPctPerRound,
    );

    captainProjByTeam.set(t.id, captainProj);
    interestProjByTeam.set(t.id, interestProj);
    // Fold into bank → flows into teamValue (squad + bank) and ranking below.
    bankByTeam.set(t.id, bankEntering + captainProj + interestProj);
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
      roundGrowthSek: roundGrowthByTeam.get(t.id) ?? null,
      bankSek: bankByTeam.get(t.id) ?? null,
      teamValueSek: teamValueByTeam.get(t.id) ?? null,
      captainBonusProjectedSek: captainProjByTeam.get(t.id) ?? 0,
      bankInterestProjectedSek: interestProjByTeam.get(t.id) ?? 0,
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
  /** For the in-progress (unscored) round only: the live projection components
   *  folded into bankSek, so the UI can write out what BANK is made of. 0 for
   *  scored rounds (their breakdown comes from `score`) and idle rounds. */
  captainBonusProjectedSek: number;
  bankInterestProjectedSek: number;
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

  const [allRounds, owner, allSquads, allSquadPlayers, allPlayers, allClubs, allSnapshots, allScores, allTransfers] =
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
      db.select().from(transfers).where(eq(transfers.teamId, teamId)),
    ]);

  // Net transfer cash flow per round for this team: Σ(sell − buy − fee).
  const cashFlowByRound = new Map<string, number>();
  for (const tr of allTransfers) {
    cashFlowByRound.set(
      tr.roundId,
      (cashFlowByRound.get(tr.roundId) ?? 0) +
        (tr.sellPriceSek - tr.buyPriceSek - tr.feeSek),
    );
  }

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
      captainBonusProjectedSek: 0,
      bankInterestProjectedSek: 0,
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
  const currentBankSekRaw =
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
            const snap = snapshotByRoundPlayer.get(`${r1.id}::${pid}`);
            if (snap === undefined) {
              missing = true;
              break;
            }
            // Purchase cost, not current value: price minus in-round growth.
            cost += snap.priceSek - snap.growthSek;
          }
          return missing ? null : currentRules.budgetSek - cost;
        })();
  const latestWithSquad = [...byRound].reverse().find((l) => l.hasSquad);
  const currentSquadValueSek = latestWithSquad?.squadValueSek ?? null;
  // Live projection (captain bonus + interest) for the in-progress round,
  // mirrored from the leaderboard row so /team matches /tabell exactly. Only
  // applied when the squad value is visible (released round, or owner/admin) —
  // a hidden squad keeps currentSquadValueSek null, so nothing leaks here.
  const liveProjectionSek =
    currentSquadValueSek !== null
      ? (me?.captainBonusProjectedSek ?? 0) + (me?.bankInterestProjectedSek ?? 0)
      : 0;
  // In-progress round's transfer cash flow (sell − buy − fee) isn't in any
  // bank_end yet — fold it into the live bank so buying a pricier player
  // doesn't inflate team value (matches the leaderboard projection).
  const inProgressCashFlowSek =
    currentSquadValueSek !== null &&
    latestWithSquad &&
    latestWithSquad.score === null
      ? (cashFlowByRound.get(latestWithSquad.roundId) ?? 0)
      : 0;
  const currentBankSek =
    currentBankSekRaw === null
      ? null
      : currentBankSekRaw + inProgressCashFlowSek + liveProjectionSek;
  const currentTeamValueSek =
    currentSquadValueSek !== null && currentBankSek !== null
      ? currentSquadValueSek + currentBankSek
      : null;

  // The in-progress round has no team_round_scores row yet, so its per-round
  // line would show BANK/LAGVÄRDE as "—". Mirror the projected bank + value
  // onto that line so the breakdown matches the summary and /tabell. (Mutates
  // the byRound entry in place; only when the squad is visible + unscored.)
  if (
    latestWithSquad &&
    latestWithSquad.score === null &&
    currentSquadValueSek !== null &&
    currentBankSek !== null
  ) {
    latestWithSquad.bankSek = currentBankSek;
    latestWithSquad.teamValueSek = currentTeamValueSek;
    latestWithSquad.captainBonusProjectedSek = me?.captainBonusProjectedSek ?? 0;
    latestWithSquad.bankInterestProjectedSek = me?.bankInterestProjectedSek ?? 0;
  }

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

// ─── Head-to-head squad summaries (for /hets) ───────────────────────────────

export type H2HPlayer = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  /** ISO 3166-1 alpha-3 of the player's WC nation, if known. */
  countryCode: string | null;
  /** Price at the summary round. null if no snapshot. */
  priceSek: number | null;
  isCaptain: boolean;
};

export type H2HSquad = {
  teamId: string;
  roundNumber: number;
  players: H2HPlayer[];
};

/**
 * Latest *released* squad per team, keyed by teamId — read-only, for the /hets
 * head-to-head. "Released" = the round is locked or scored, so the lineup is
 * already public (matches the anti-cheat rule in getTeamDetail). Returns {} if
 * no round has been released yet. Prices come from that round's snapshots
 * (manual wins over api).
 */
export async function getH2HSquads(): Promise<Record<string, H2HSquad>> {
  const [allRounds, allSquads, allSquadPlayers, allPlayers, allClubs, allSnapshots] =
    await Promise.all([
      db.select().from(rounds).orderBy(asc(rounds.number)),
      db.select().from(squads),
      db.select().from(squadPlayers),
      db.select().from(players),
      db.select().from(clubs),
      db.select().from(playerRoundSnapshots),
    ]);

  const releasedIds = new Set(
    allRounds.filter((r) => r.status === "locked" || r.status === "scored").map((r) => r.id),
  );
  if (releasedIds.size === 0) return {};

  const roundById = new Map(allRounds.map((r) => [r.id, r]));
  const roundOrder = new Map(allRounds.map((r, i) => [r.id, i] as const));
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));
  const clubById = new Map(allClubs.map((c) => [c.id, c]));

  // Per team, the released squad from the highest-ordered round.
  const latestByTeam = new Map<string, (typeof allSquads)[number]>();
  for (const sq of allSquads) {
    if (!releasedIds.has(sq.roundId)) continue;
    const cur = latestByTeam.get(sq.teamId);
    const newIdx = roundOrder.get(sq.roundId) ?? -1;
    const curIdx = cur ? (roundOrder.get(cur.roundId) ?? -1) : -1;
    if (newIdx > curIdx) latestByTeam.set(sq.teamId, sq);
  }

  const playersBySquad = new Map<string, string[]>();
  for (const sp of allSquadPlayers) {
    const arr = playersBySquad.get(sp.squadId) ?? [];
    arr.push(sp.playerId);
    playersBySquad.set(sp.squadId, arr);
  }

  const snapshotByRoundPlayer = new Map<string, { priceSek: number; source: "api" | "manual" }>();
  for (const s of allSnapshots) {
    const key = `${s.roundId}::${s.playerId}`;
    const existing = snapshotByRoundPlayer.get(key);
    if (!existing || (existing.source === "api" && s.source === "manual")) {
      snapshotByRoundPlayer.set(key, { priceSek: s.priceSek, source: s.source });
    }
  }

  const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
  const out: Record<string, H2HSquad> = {};
  for (const [teamId, sq] of latestByTeam) {
    const round = roundById.get(sq.roundId);
    if (!round) continue;
    const pids = playersBySquad.get(sq.id) ?? [];
    const squadPlayersList: H2HPlayer[] = pids.flatMap((pid) => {
      const p = playerById.get(pid);
      if (!p) return [];
      const club = p.clubId ? clubById.get(p.clubId) : null;
      const snap = snapshotByRoundPlayer.get(`${sq.roundId}::${pid}`);
      return [
        {
          id: p.id,
          name: p.name,
          position: p.position,
          countryCode: club?.countryCode ?? null,
          priceSek: snap?.priceSek ?? null,
          isCaptain: sq.captainPlayerId === pid,
        },
      ];
    });
    squadPlayersList.sort((a, b) => {
      if (order[a.position] !== order[b.position]) return order[a.position] - order[b.position];
      if (a.isCaptain !== b.isCaptain) return a.isCaptain ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    out[teamId] = { teamId, roundNumber: round.number, players: squadPlayersList };
  }
  return out;
}
