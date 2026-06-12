import type { LeaderboardRow } from "@/lib/leaderboard";

/**
 * Fake standings for previewing /hets?demo=1 in development before any real
 * round is scored. NEVER used in production (the page guards on NODE_ENV).
 * Hand-picked to exercise every roast branch and all three tiers.
 */
const SEEDS: Array<Partial<LeaderboardRow> & { rank: number; teamName: string }> = [
  { rank: 1, teamName: "Los Galácticos", ownerHandle: "ruy", rankChange: 2, bankSek: 1_200_000, roundGrowthSek: 800_000, dailyBetsPoints: 6 },
  { rank: 2, teamName: "Bollkänsla FC", ownerHandle: "anna", rankChange: 4, bankSek: 400_000, roundGrowthSek: 600_000, dailyBetsPoints: 3 },
  { rank: 3, teamName: "Snålvargarna", ownerHandle: "pelle", rankChange: -1, bankSek: 8_400_000, roundGrowthSek: 100_000, dailyBetsPoints: 2 },
  { rank: 4, teamName: "Offside Always", ownerHandle: "kim", rankChange: 0, bankSek: 900_000, roundGrowthSek: 250_000, dailyBetsPoints: 4 },
  { rank: 5, teamName: "Tiki Taka Tobbe", ownerHandle: "tobbe", rankChange: 1, bankSek: 600_000, roundGrowthSek: 120_000, dailyBetsPoints: 0 },
  { rank: 6, teamName: "Mittfältsmaffian", ownerHandle: "sara", rankChange: -2, bankSek: 300_000, roundGrowthSek: 90_000, dailyBetsPoints: 5 },
  { rank: 7, teamName: "Lagom United", ownerHandle: "jocke", rankChange: 0, bankSek: 500_000, roundGrowthSek: 0, dailyBetsPoints: 2 },
  { rank: 8, teamName: "VAR-offren", ownerHandle: "lisa", rankChange: 1, bankSek: 250_000, roundGrowthSek: 40_000, dailyBetsPoints: 1 },
  { rank: 9, teamName: "Halvljumma Hörnan", ownerHandle: "nisse", rankChange: -3, bankSek: 150_000, roundGrowthSek: -50_000, dailyBetsPoints: 3 },
  { rank: 10, teamName: "Reservbänken", ownerHandle: "fia", rankChange: 0, bankSek: 100_000, roundGrowthSek: 10_000, dailyBetsPoints: 0 },
  { rank: 11, teamName: "Sämst i Klassen", ownerHandle: "olle", rankChange: -5, bankSek: -200_000, roundGrowthSek: -300_000, dailyBetsPoints: 1, ownerStatus: "pending" },
  { rank: 12, teamName: "Bottennappet", ownerHandle: "mia", rankChange: -1, bankSek: -50_000, roundGrowthSek: -120_000, dailyBetsPoints: 0 },
];

export function demoLeaderboardRows(): LeaderboardRow[] {
  const n = SEEDS.length;
  return SEEDS.map((s, i) => {
    const total = (n - s.rank) * 350_000;
    return {
      rank: s.rank,
      prevRank: s.rankChange != null ? s.rank + s.rankChange : null,
      rankChange: s.rankChange ?? null,
      teamId: `demo-${i}`,
      teamName: s.teamName,
      ownerHandle: s.ownerHandle ?? "okänd",
      ownerStatus: s.ownerStatus ?? "approved",
      totalPointsSek: total,
      perRound: [
        { roundId: `r1-${i}`, roundNumber: 1, roundName: "ROND 1", pointsSek: Math.round(total * 0.6) },
        { roundId: `r2-${i}`, roundNumber: 2, roundName: "ROND 2", pointsSek: Math.round(total * 0.4) },
      ],
      dailyBetsPoints: s.dailyBetsPoints ?? 0,
      squadValueSek: 48_000_000 + total,
      roundGrowthSek: s.roundGrowthSek ?? 0,
      bankSek: s.bankSek ?? 0,
      teamValueSek: 48_000_000 + total + (s.bankSek ?? 0),
    } satisfies LeaderboardRow;
  });
}
