import type { APIRoute } from 'astro';

const API_BASE = 'https://api-manager.aftonbladet.se';

export const GET: APIRoute = async ({ params }) => {
  const teamId = params.id;

  try {
    // Fetch team info, lineup, values, and trades in parallel
    const [teamRes, lineupRes, valuesRes, tradesRes] = await Promise.all([
      fetch(`${API_BASE}/fantasyteams/${teamId}`),
      fetch(`${API_BASE}/fantasyteams/${teamId}/lineup`),
      fetch(`${API_BASE}/fantasyteams/${teamId}/values`),
      fetch(`${API_BASE}/fantasyteams/${teamId}/trades`),
    ]);

    if (!teamRes.ok) throw new Error('Team not found');

    const team = await teamRes.json();

    // Resolve username
    const userId = team.user?.id || team.user;
    let username = team.slug;
    if (userId) {
      try {
        const userRes = await fetch(`${API_BASE}/users/${userId}`);
        if (userRes.ok) {
          const userData = await userRes.json();
          username = userData.username || userData.slug || team.slug;
        }
      } catch {}
    }

    // Fetch game rounds for trade grouping
    const gameId = team.game?.id || team.game;
    const gameRes = await fetch(`${API_BASE}/games/${gameId}`);
    const game = gameRes.ok ? await gameRes.json() : { rounds: [] };
    const gameRounds: { start: string; end: string }[] = game.rounds || [];
    const lineupData = await lineupRes.json();
    const values = await valuesRes.json();
    let trades: any[] = [];
    if (tradesRes.ok) {
      try { trades = await tradesRes.json(); } catch { trades = []; }
    }
    if (!Array.isArray(trades)) trades = [];

    // Resolve player details from lineup
    const lineup = lineupData.lineup || [];
    const players = await Promise.all(
      lineup.map(async (entry: { player: number; flags?: string[] }) => {
        try {
          const playerRes = await fetch(`${API_BASE}/players/${entry.player}`);
          const player = await playerRes.json();

          const [personRes, clubRes] = await Promise.all([
            fetch(`${API_BASE}/persons/${player.person}`),
            fetch(`${API_BASE}/teams/${player.team}`),
          ]);

          const person = await personRes.json();
          const club = await clubRes.json();

          return {
            name: person.fullName,
            club: club.name,
            clubAbbr: club.abbreviation,
            position: Number(player.position),
            isCaptain: (entry.flags || []).includes('captain'),
          };
        } catch {
          return null;
        }
      })
    );

    // Sort values by round
    const sortedValues = (values as any[]).sort((a, b) => a.round - b.round);

    const validPlayers = players.filter(Boolean) as NonNullable<typeof players[number]>[];
    validPlayers.sort((a, b) => a.position - b.position);

    // Resolve trade player names (batch unique player IDs)
    const tradePlayerIds = [...new Set(trades.map((t: any) => t.player))];
    const playerNameMap: Record<number, string> = {};
    await Promise.all(
      tradePlayerIds.map(async (pid: number) => {
        try {
          const pRes = await fetch(`${API_BASE}/players/${pid}`);
          const p = await pRes.json();
          const personRes = await fetch(`${API_BASE}/persons/${p.person}`);
          const person = await personRes.json();
          playerNameMap[pid] = person.fullName;
        } catch {
          playerNameMap[pid] = 'Okänd';
        }
      })
    );

    // Map trades to rounds
    function getTradeRound(tradeDate: string): number {
      const t = new Date(tradeDate).getTime();
      for (let i = 0; i < gameRounds.length; i++) {
        const end = new Date(gameRounds[i].end).getTime();
        if (t <= end) return i + 1;
      }
      return gameRounds.length > 0 ? gameRounds.length : 0;
    }

    const resolvedTrades = trades.map((t: any) => ({
      type: t.type,
      player: playerNameMap[t.player] || 'Okänd',
      at: t.at,
      round: getTradeRound(t.at),
    })).sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return new Response(
      JSON.stringify({
        name: team.name,
        manager: username,
        players: validPlayers,
        rounds: sortedValues.map((v: any) => ({
          round: v.round,
          value: v.value,
          growth: v.growth,
        })),
        totalGrowth: sortedValues.reduce((sum: number, v: any) => sum + v.growth, 0),
        trades: resolvedTrades,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
