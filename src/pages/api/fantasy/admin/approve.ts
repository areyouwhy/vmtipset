import type { APIRoute } from 'astro';
import { getTeam, putTeam } from '../../../../lib/fantasy';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { pin, teamId, status } = body;

    const adminPin = import.meta.env.ADMIN_PIN || process.env.ADMIN_PIN || '';
    if (!pin || pin !== adminPin) {
      return json({ error: 'Fel admin-PIN' }, 401);
    }

    if (!teamId || !['approved', 'rejected'].includes(status)) {
      return json({ error: 'Ogiltigt teamId eller status' }, 400);
    }

    const team = await getTeam(teamId);
    if (!team) {
      return json({ error: 'Laget hittades inte' }, 404);
    }

    team.status = status;
    team.updatedAt = new Date().toISOString();
    await putTeam(team);

    return json({ ok: true, teamId, status }, 200);
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
