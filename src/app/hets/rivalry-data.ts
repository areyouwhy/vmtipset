import { getH2HSquads, getLeaderboard, type H2HSquad, type LeaderboardRow } from "@/lib/leaderboard";

/**
 * Shared read-only fetch for the rivalry pages: the live leaderboard indexed by
 * team name, the released squads (for head-to-head trupp comparisons), and
 * whether any round has been scored. Pure read — touches no game state.
 */
export type RivalryData = {
  rowsByName: Map<string, LeaderboardRow>;
  squadByTeamId: Record<string, H2HSquad>;
  anyScored: boolean;
};

export async function getRivalryData(): Promise<RivalryData> {
  const [lb, squadByTeamId] = await Promise.all([
    getLeaderboard(),
    getH2HSquads(),
  ]);
  const rowsByName = new Map(lb.rows.map((r) => [r.teamName, r]));
  return { rowsByName, squadByTeamId, anyScored: lb.anyScored };
}
