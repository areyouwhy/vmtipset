import { asc, eq, sum } from "drizzle-orm";
import { db } from "@/db";
import {
  betAnswers,
  bets,
  clubs,
  players,
  rounds,
  teams,
  users,
  type Bet,
  type BetAnswer,
} from "@/db/schema";

export type BetWithMeta = {
  bet: Bet;
  roundName: string | null;
  roundNumber: number | null;
  answerCount: number;
  correctPlayerName: string | null;
  correctPlayerCountry: string | null;
};

export type BetAnswerWithMeta = BetAnswer & {
  teamName: string;
  ownerHandle: string;
  answerPlayerName: string | null;
  answerPlayerCountry: string | null;
};

export async function getAllBetsWithMeta(): Promise<BetWithMeta[]> {
  const [allBets, allRounds, allAnswers, allPlayers, allClubs] = await Promise.all([
    db.select().from(bets).orderBy(asc(bets.createdAt)),
    db.select().from(rounds),
    db.select().from(betAnswers),
    db.select().from(players),
    db.select().from(clubs),
  ]);
  const roundById = new Map(allRounds.map((r) => [r.id, r]));
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));
  const clubById = new Map(allClubs.map((c) => [c.id, c]));
  const answerCountByBet = new Map<string, number>();
  for (const a of allAnswers) {
    answerCountByBet.set(a.betId, (answerCountByBet.get(a.betId) ?? 0) + 1);
  }
  return allBets.map((b) => {
    const round = b.roundId ? roundById.get(b.roundId) : undefined;
    const cp = b.correctAnswerPlayerId
      ? playerById.get(b.correctAnswerPlayerId)
      : undefined;
    const club = cp?.clubId ? clubById.get(cp.clubId) : undefined;
    return {
      bet: b,
      roundName: round?.name ?? null,
      roundNumber: round?.number ?? null,
      answerCount: answerCountByBet.get(b.id) ?? 0,
      correctPlayerName: cp?.name ?? null,
      correctPlayerCountry: club?.countryCode ?? null,
    };
  });
}

export async function getOpenBetsForUser(
  teamId: string,
): Promise<{
  bets: BetWithMeta[];
  myAnswersByBet: Map<string, BetAnswer>;
}> {
  const all = await getAllBetsWithMeta();
  const open = all.filter((b) => b.bet.status === "open");
  const myAnswers = await db
    .select()
    .from(betAnswers)
    .where(eq(betAnswers.teamId, teamId));
  const map = new Map(myAnswers.map((a) => [a.betId, a]));
  return { bets: open, myAnswersByBet: map };
}

export async function getBetAnswersForBet(
  betId: string,
): Promise<BetAnswerWithMeta[]> {
  const [rows, allTeams, allUsers, allPlayers, allClubs] = await Promise.all([
    db.select().from(betAnswers).where(eq(betAnswers.betId, betId)),
    db.select().from(teams),
    db.select().from(users),
    db.select().from(players),
    db.select().from(clubs),
  ]);
  const teamById = new Map(allTeams.map((t) => [t.id, t]));
  const userById = new Map(allUsers.map((u) => [u.id, u]));
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));
  const clubById = new Map(allClubs.map((c) => [c.id, c]));

  return rows.map((a) => {
    const team = teamById.get(a.teamId);
    const owner = team ? userById.get(team.ownerUserId) : undefined;
    const player = a.answerPlayerId ? playerById.get(a.answerPlayerId) : undefined;
    const club = player?.clubId ? clubById.get(player.clubId) : undefined;
    return {
      ...a,
      teamName: team?.name ?? "?",
      ownerHandle:
        owner?.displayName || owner?.email.split("@")[0] || "okänd",
      answerPlayerName: player?.name ?? null,
      answerPlayerCountry: club?.countryCode ?? null,
    } satisfies BetAnswerWithMeta;
  });
}

export async function getBetTotalsByTeam(): Promise<Map<string, number>> {
  // Per team: sum of pointsAwarded across all scored bets
  const rows = await db
    .select({
      teamId: betAnswers.teamId,
      total: sum(betAnswers.pointsAwarded),
    })
    .from(betAnswers)
    .groupBy(betAnswers.teamId);
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.teamId, Number(r.total ?? 0));
  }
  return map;
}
