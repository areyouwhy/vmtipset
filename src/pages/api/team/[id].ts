import type { APIRoute } from 'astro';

const API_BASE = 'https://api-manager.aftonbladet.se';

export const GET: APIRoute = async ({ params }) => {
  const teamId = params.id;

  try {
    // Fetch team info, lineup, and values in parallel
    const [teamRes, lineupRes, valuesRes] = await Promise.all([
      fetch(`${API_BASE}/fantasyteams/${teamId}`),
      fetch(`${API_BASE}/fantasyteams/${teamId}/lineup`),
      fetch(`${API_BASE}/fantasyteams/${teamId}/values`),
    ]);

    if (!teamRes.ok) throw new Error('Team not found');

    const team = await teamRes.json();
    const lineupData = await lineupRes.json();
    const values = await valuesRes.json();

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
