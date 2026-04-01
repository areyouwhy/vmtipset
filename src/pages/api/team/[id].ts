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

    const resolvedTrades = trades.map((t: any) => ({
      type: t.type,
      player: playerNameMap[t.player] || 'Okänd',
      at: t.at,
    })).sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return new Response(
      JSON.stringify({
        name: team.name,
        manager: team.user?.username || team.slug,
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
