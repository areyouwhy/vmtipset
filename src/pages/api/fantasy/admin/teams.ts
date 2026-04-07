import type { APIRoute } from 'astro';
import { listTeams } from '../../../../lib/fantasy';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const pin = url.searchParams.get('pin');
    const adminPin = import.meta.env.ADMIN_PIN || process.env.ADMIN_PIN || '';

    if (!pin || pin !== adminPin) {
      return json({ error: 'Fel admin-PIN' }, 401);
    }

    const teams = await listTeams();
    const safe = teams.map(t => ({
      teamId: t.teamId,
      teamName: t.teamName,
      status: t.status || 'pending',
      playerCount: t.players.length,
      formationId: t.formationId,
      createdAt: t.createdAt,
    }));

    return json(safe, 200);
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
