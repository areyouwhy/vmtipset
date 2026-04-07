import type { APIRoute } from 'astro';
import { slugify, hashPin, signSession, getTeam, makeSetCookie } from '../../../lib/fantasy';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { teamName, pin } = body;

    if (!teamName || !pin) {
      return json({ error: 'Lagnamn och PIN krävs' }, 400);
    }

    const teamId = slugify(teamName.trim());
    const team = await getTeam(teamId);

    if (!team) {
      return json({ error: 'Laget hittades inte' }, 404);
    }

    const pinHash = await hashPin(pin);
    if (pinHash !== team.pinHash) {
      return json({ error: 'Fel PIN' }, 401);
    }

    const secret = import.meta.env.SESSION_SECRET || process.env.SESSION_SECRET || '';
    const cookie = await signSession(teamId, secret);

    return json({ teamId: team.teamId, teamName: team.teamName }, 200, {
      'Set-Cookie': makeSetCookie(cookie),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, 500);
  }
};

function json(data: any, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
