import type { APIRoute } from 'astro';

const API_BASE = 'https://api-manager.aftonbladet.se';
const COMPETITION_ID = 666201;

interface TeamValue {
  round: number;
  value: number;
  growth: number;
}

interface TeamEntry {
  id: number;
  name: string;
  manager: string;
  values: TeamValue[];
  tradeCount: number;
}

export const GET: APIRoute = async () => {
  try {
    // 1. Get all enrollments
    const allTeams: { id: number; name: string; manager: string }[] = [];
    let page = 1;
    while (true) {
      const res = await fetch(`${API_BASE}/competitions/${COMPETITION_ID}/enrollments?page=${page}&pageSize=50`);
      const data = await res.json();
      for (const item of data.items) {
        allTeams.push({
          id: item.fantasyTeam.id,
          name: item.fantasyTeam.name,
          manager: item.fantasyTeam.user.username,
        });
      }
      if (!data.links.next || data.items.length < 50) break;
      page++;
    }

    // 2. Fetch values and trades for each team in parallel
    const teamData: TeamEntry[] = await Promise.all(
      allTeams.map(async (team) => {
        const [valRes, tradeRes] = await Promise.all([
          fetch(`${API_BASE}/fantasyteams/${team.id}/values`),
          fetch(`${API_BASE}/fantasyteams/${team.id}/trades`),
        ]);

        const values: TeamValue[] = valRes.ok ? await valRes.json() : [];
        let trades: any[] = [];
        if (tradeRes.ok) {
          try { trades = await tradeRes.json(); } catch { trades = []; }
        }

        return {
          ...team,
          values: values.sort((a, b) => a.round - b.round),
          tradeCount: Array.isArray(trades) ? trades.filter((t: any) => t.type === 'purchase').length : 0,
        };
      })
    );

    // 3. Compute stats
    let bestRound = { team: '', manager: '', growth: -Infinity, round: 0 };
    let worstRound = { team: '', manager: '', growth: Infinity, round: 0 };
    let mostTrades = { team: '', manager: '', count: 0 };
    let mostConsistent = { team: '', manager: '', variance: Infinity };
    let longestStreak = { team: '', manager: '', streak: 0, type: '' as 'positive' | 'negative' };

    for (const team of teamData) {
      // Best/worst round
      for (const v of team.values) {
        if (v.growth > bestRound.growth) {
          bestRound = { team: team.name, manager: team.manager, growth: v.growth, round: v.round };
        }
        if (v.growth < worstRound.growth) {
          worstRound = { team: team.name, manager: team.manager, growth: v.growth, round: v.round };
        }
      }

      // Most trades
      if (team.tradeCount > mostTrades.count) {
        mostTrades = { team: team.name, manager: team.manager, count: team.tradeCount };
      }

      // Consistency (lowest standard deviation of growth)
      if (team.values.length > 1) {
        const growths = team.values.map(v => v.growth);
        const mean = growths.reduce((a, b) => a + b, 0) / growths.length;
        const variance = growths.reduce((sum, g) => sum + Math.pow(g - mean, 2), 0) / growths.length;
        if (variance < mostConsistent.variance) {
          mostConsistent = { team: team.name, manager: team.manager, variance };
        }
      }

      // Longest positive streak
      let currentStreak = 0;
      let currentType: 'positive' | 'negative' = 'positive';
      for (const v of team.values) {
        if (v.growth > 0) {
          if (currentType === 'positive') {
            currentStreak++;
          } else {
            currentStreak = 1;
            currentType = 'positive';
          }
        } else {
          if (currentType === 'negative') {
            currentStreak++;
          } else {
            currentStreak = 1;
            currentType = 'negative';
          }
        }
        if (currentStreak > longestStreak.streak) {
          longestStreak = { team: team.name, manager: team.manager, streak: currentStreak, type: currentType };
        }
      }
    }

    // Head-to-head data: return all teams with round values for client-side comparison
    const h2hData = teamData.map(t => ({
      id: t.id,
      name: t.name,
      manager: t.manager,
      rounds: t.values.map(v => ({ round: v.round, growth: v.growth })),
      totalGrowth: t.values.reduce((sum, v) => sum + v.growth, 0),
    }));

    return new Response(JSON.stringify({
      highlights: {
        bestRound: {
          label: 'Bästa omgång',
          team: bestRound.team,
          detail: 'Omgång ' + bestRound.round + ' — +' + (bestRound.growth / 1000000).toFixed(2) + 'M',
        },
        worstRound: {
          label: 'Sämsta omgång',
          team: worstRound.team,
          detail: 'Omgång ' + worstRound.round + ' — ' + (worstRound.growth / 1000000).toFixed(2) + 'M',
        },
        mostTrades: {
          label: 'Flest värvningar',
          team: mostTrades.team,
          detail: mostTrades.count + ' spelarköp',
        },
        mostConsistent: {
          label: 'Mest jämn',
          team: mostConsistent.team,
          detail: 'Lägst variation mellan omgångar',
        },
        longestStreak: {
          label: longestStreak.type === 'positive' ? 'Längsta vinstsvit' : 'Längsta svacka',
          team: longestStreak.team,
          detail: longestStreak.streak + ' omgångar i rad',
        },
      },
      teams: h2hData,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
