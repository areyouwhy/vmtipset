import type { APIRoute } from 'astro';

const API_BASE = 'https://api-manager.aftonbladet.se';
const GAME_ID = '731';

export const GET: APIRoute = async ({ params }) => {
  const playerId = params.id;

  try {
    const [statsRes, valuesRes] = await Promise.all([
      fetch(`${API_BASE}/games/${GAME_ID}/players/${playerId}/statistics`),
      fetch(`${API_BASE}/games/${GAME_ID}/players/${playerId}/values`),
    ]);

    if (!statsRes.ok) throw new Error('Player not found');

    const statistics = await statsRes.json();
    const values = valuesRes.ok ? await valuesRes.json() : [];

    const sortedValues = (values as any[]).sort((a: any, b: any) => a.round - b.round);

    return new Response(
      JSON.stringify({
        statistics: (statistics as any[]).map((s: any) => ({
          matchId: s.match?.id ?? s.match,
          events: (s.events || []).map((e: any) => ({
            typeId: e.type?.id ?? e.type,
            amount: e.amount,
          })),
        })),
        values: sortedValues.map((v: any) => ({
          round: v.round,
          value: v.value,
          growth: v.growth,
          totalGrowth: v.totalGrowth,
          popularity: v.popularity,
        })),
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
