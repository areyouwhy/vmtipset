import type { APIRoute } from 'astro';
import { getSessionCookie, verifySession, getTeam } from '../../../lib/fantasy';

export const GET: APIRoute = async ({ request }) => {
  try {
    const cookie = getSessionCookie(request);
    if (!cookie) {
      return json({ authenticated: false }, 200);
    }

    const secret = import.meta.env.SESSION_SECRET || process.env.SESSION_SECRET || '';
    const teamId = await verifySession(cookie, secret);
    if (!teamId) {
      return json({ authenticated: false }, 200);
    }

    const team = await getTeam(teamId);
    if (!team) {
      return json({ authenticated: false }, 200);
    }

    return json({
      authenticated: true,
      teamId: team.teamId,
      teamName: team.teamName,
      status: team.status || 'approved',
      formationId: team.formationId,
      players: team.players,
      budget: team.budget,
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
