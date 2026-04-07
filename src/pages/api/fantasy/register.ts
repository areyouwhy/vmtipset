import type { APIRoute } from 'astro';
import { slugify, hashPin, signSession, putTeam, teamExists, makeSetCookie, getLeagueConfig } from '../../../lib/fantasy';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { teamName, pin } = body;

    if (!teamName || typeof teamName !== 'string' || teamName.trim().length < 2 || teamName.trim().length > 30) {
      return json({ error: 'Lagnamnet måste vara 2–30 tecken' }, 400);
    }

    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return json({ error: 'PIN måste vara exakt 4 siffror' }, 400);
    }

    const teamId = slugify(teamName.trim());
    if (!teamId) {
      return json({ error: 'Ogiltigt lagnamn' }, 400);
    }

    if (await teamExists(teamId)) {
      return json({ error: 'Lagnamnet är redan taget' }, 409);
    }

    const config = await getLeagueConfig();
    if (!config.registrationOpen) {
      return json({ error: 'Registreringen är stängd' }, 403);
    }

    const pinHash = await hashPin(pin);
    const now = new Date().toISOString();

    await putTeam({
      teamId,
      teamName: teamName.trim(),
      pinHash,
      status: 'approved',
      formationId: 0,
      players: [],
      budget: config.startingBudget,
      createdAt: now,
      updatedAt: now,
    });

    const secret = import.meta.env.SESSION_SECRET || process.env.SESSION_SECRET || '';
    const cookie = await signSession(teamId, secret);

    return json({ teamId, teamName: teamName.trim() }, 200, {
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
