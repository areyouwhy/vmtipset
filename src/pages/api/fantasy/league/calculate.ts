import type { APIRoute } from 'astro';
import { put, head, list } from '@vercel/blob';
import { listTeams, getLeagueConfig } from '../../../../lib/fantasy';
import { API_BASE } from '../../../../lib/constants';

interface RoundScore {
  round: number;
  playerGrowth: number;
  captainBonus: number;
  bankInterest: number;
  total: number;
}

interface TeamScores {
  teamId: string;
  teamName: string;
  rounds: RoundScore[];
  totalGrowth: number;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { pin, round } = body;

    // Verify admin
    const adminPin = import.meta.env.ADMIN_PIN || process.env.ADMIN_PIN || '';
    if (!pin || pin !== adminPin) {
      return json({ error: 'Fel admin-PIN' }, 401);
    }

    const config = await getLeagueConfig();
    const gameId = config.currentGameId || '731';

    // Determine which rounds to calculate
    const gameRes = await fetch(`${API_BASE}/games/${gameId}`);
    if (!gameRes.ok) return json({ error: 'Kunde inte ladda speldata' }, 500);
    const gameData = await gameRes.json();
    const rounds = gameData.rounds || [];
    const now = new Date();

    // Find completed rounds
    const completedRounds: number[] = [];
    for (let i = 0; i < rounds.length; i++) {
      if (new Date(rounds[i].end) < now) {
        completedRounds.push(i + 1);
      }
    }

    // If specific round requested, only calculate that one
    const roundsToCalc = round ? [round] : completedRounds;

    if (roundsToCalc.length === 0) {
      return json({ message: 'Inga avslutade omgångar att beräkna' }, 200);
    }

    // Load all teams
    const teams = await listTeams();
    const approvedTeams = teams.filter(t => (t.status || 'approved') === 'approved' && t.players.length > 0);

    if (approvedTeams.length === 0) {
      return json({ message: 'Inga lag med spelare att beräkna' }, 200);
    }

    // Load existing scores (or start fresh)
    let allScores: Record<string, TeamScores> = {};
    try {
      const meta = await head('league/scores.json');
      const res = await fetch(meta.url);
      if (res.ok) allScores = await res.json();
    } catch { /* no existing scores */ }

    // Calculate each round
    const results: any[] = [];
    for (const roundNum of roundsToCalc) {
      // Fetch all players' growth for this round
      const roundRes = await fetch(`${API_BASE}/games/${gameId}/rounds/${roundNum}/players`);
      if (!roundRes.ok) {
        results.push({ round: roundNum, error: 'Kunde inte ladda omgångsdata' });
        continue;
      }
      const roundPlayers = await roundRes.json();

      // Build growth lookup: playerId -> growth
      const growthMap = new Map<number, number>();
      for (const rp of roundPlayers) {
        growthMap.set(rp.player.id, rp.growth || 0);
      }

      // Score each team
      for (const team of approvedTeams) {
        if (!allScores[team.teamId]) {
          allScores[team.teamId] = {
            teamId: team.teamId,
            teamName: team.teamName,
            rounds: [],
            totalGrowth: 0,
          };
        }

        const ts = allScores[team.teamId];

        // Skip if already calculated for this round
        if (ts.rounds.find(r => r.round === roundNum)) continue;

        // Sum player growth
        let playerGrowth = 0;
        let captainGrowth = 0;
        for (const p of team.players) {
          const growth = growthMap.get(p.playerId) || 0;
          playerGrowth += growth;
          if (p.isCaptain) captainGrowth = growth;
        }

        // Captain bonus: 1x extra growth, only if positive
        const captainBonus = config.captainBonusOnlyPositive
          ? Math.max(0, captainGrowth)
          : captainGrowth;

        // Bank interest on unspent budget
        const bankInterest = Math.round(team.budget * (config.bankInterestPercent || 0) / 100);

        const roundTotal = playerGrowth + captainBonus + bankInterest;

        ts.rounds.push({
          round: roundNum,
          playerGrowth,
          captainBonus,
          bankInterest,
          total: roundTotal,
        });

        // Sort rounds
        ts.rounds.sort((a, b) => a.round - b.round);

        // Recalculate total
        ts.totalGrowth = ts.rounds.reduce((sum, r) => sum + r.total, 0);
      }

      results.push({ round: roundNum, teamsScored: approvedTeams.length });
    }

    // Save scores
    await put('league/scores.json', JSON.stringify(allScores), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return json({
      ok: true,
      roundsCalculated: results,
      standings: Object.values(allScores)
        .sort((a, b) => b.totalGrowth - a.totalGrowth)
        .map((t, i) => ({
          position: i + 1,
          teamId: t.teamId,
          teamName: t.teamName,
          totalGrowth: t.totalGrowth,
          rounds: t.rounds,
        })),
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, 500);
  }
};

function json(data: any, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
