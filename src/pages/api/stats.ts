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

    // 4. Fetch lineups for player/captain analysis
    const playerCount: Record<number, number> = {};
    const captainCount: Record<number, number> = {};
    const teamSquads: Record<number, number[]> = {};

    await Promise.all(
      allTeams.map(async (team) => {
        try {
          const luRes = await fetch(`${API_BASE}/fantasyteams/${team.id}/lineup`);
          if (!luRes.ok) return;
          const luData = await luRes.json();
          const lineup = luData.lineup || [];
          const squad: number[] = [];

          for (const entry of lineup) {
            const pid = entry.player;
            squad.push(pid);
            playerCount[pid] = (playerCount[pid] || 0) + 1;
            if ((entry.flags || []).includes('captain')) {
              captainCount[pid] = (captainCount[pid] || 0) + 1;
            }
          }
          teamSquads[team.id] = squad;
        } catch {}
      })
    );

    // Resolve top player names
    async function resolvePlayerName(playerId: number): Promise<string> {
      try {
        const pRes = await fetch(`${API_BASE}/players/${playerId}`);
        const p = await pRes.json();
        const personRes = await fetch(`${API_BASE}/persons/${p.person}`);
        const person = await personRes.json();
        return person.fullName;
      } catch {
        return 'Okänd';
      }
    }

    // Most used player
    const sortedPlayers = Object.entries(playerCount).sort((a, b) => Number(b[1]) - Number(a[1]));
    const topPlayerId = sortedPlayers.length > 0 ? Number(sortedPlayers[0][0]) : 0;
    const topPlayerCount = sortedPlayers.length > 0 ? Number(sortedPlayers[0][1]) : 0;
    const topPlayerName = topPlayerId ? await resolvePlayerName(topPlayerId) : '';

    // Most captained
    const sortedCaptains = Object.entries(captainCount).sort((a, b) => Number(b[1]) - Number(a[1]));
    const topCaptainId = sortedCaptains.length > 0 ? Number(sortedCaptains[0][0]) : 0;
    const topCaptainCount = sortedCaptains.length > 0 ? Number(sortedCaptains[0][1]) : 0;
    const topCaptainName = topCaptainId ? await resolvePlayerName(topCaptainId) : '';

    // Most unique team
    let mostUniqueTeam = { id: 0, name: '', pct: 0 };
    for (const team of allTeams) {
      const squad = teamSquads[team.id];
      if (!squad || squad.length === 0) continue;
      const uniqueCount = squad.filter(p => playerCount[p] === 1).length;
      const pct = uniqueCount / squad.length;
      if (pct > mostUniqueTeam.pct) {
        mostUniqueTeam = { id: team.id, name: team.name, pct };
      }
    }

    // Fewest trades (most passive manager)
    let fewestTrades = { id: 0, name: '', count: Infinity };
    for (const team of teamData) {
      if (team.tradeCount < fewestTrades.count) {
        fewestTrades = { id: team.id, name: team.name, count: team.tradeCount };
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

    // Find team IDs for existing highlights
    const findTeamId = (name: string) => allTeams.find(t => t.name === name)?.id || 0;

    return new Response(JSON.stringify({
      highlights: [
        {
          label: 'Bästa omgång',
          team: bestRound.team,
          teamId: findTeamId(bestRound.team),
          detail: 'Omgång ' + bestRound.round + ' — +' + (bestRound.growth / 1000000).toFixed(2) + 'M',
        },
        {
          label: 'Sämsta omgång',
          team: worstRound.team,
          teamId: findTeamId(worstRound.team),
          detail: 'Omgång ' + worstRound.round + ' — ' + (worstRound.growth / 1000000).toFixed(2) + 'M',
        },
        {
          label: 'Populäraste spelaren',
          team: topPlayerName,
          teamId: 0,
          detail: topPlayerCount + ' av ' + allTeams.length + ' lag',
        },
        {
          label: 'Mest kaptensvald',
          team: topCaptainName,
          teamId: 0,
          detail: topCaptainCount + ' lag har hen som kapten',
        },
        {
          label: 'Mest unika lag',
          team: mostUniqueTeam.name,
          teamId: mostUniqueTeam.id,
          detail: Math.round(mostUniqueTeam.pct * 100) + '% unika spelare',
        },
        {
          label: 'Flest värvningar',
          team: mostTrades.team,
          teamId: findTeamId(mostTrades.team),
          detail: mostTrades.count + ' spelarköp',
        },
        {
          label: 'Minst värvningar',
          team: fewestTrades.name,
          teamId: fewestTrades.id,
          detail: fewestTrades.count + ' spelarköp',
        },
        {
          label: 'Mest jämn',
          team: mostConsistent.team,
          teamId: findTeamId(mostConsistent.team),
          detail: 'Lägst variation mellan omgångar',
        },
        {
          label: longestStreak.type === 'positive' ? 'Längsta vinstsvit' : 'Längsta svacka',
          team: longestStreak.team,
          teamId: findTeamId(longestStreak.team),
          detail: longestStreak.streak + ' omgångar i rad',
        },
      ],
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
