import type { APIRoute } from 'astro';
import { getSessionCookie, verifySession, getTeam, putTeam, getLeagueConfig } from '../../../../lib/fantasy';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Verify session
    const cookie = getSessionCookie(request);
    if (!cookie) return json({ error: 'Inte inloggad' }, 401);

    const secret = import.meta.env.SESSION_SECRET || process.env.SESSION_SECRET || '';
    const teamId = await verifySession(cookie, secret);
    if (!teamId) return json({ error: 'Sessionen har gått ut' }, 401);

    const team = await getTeam(teamId);
    if (!team) return json({ error: 'Laget hittades inte' }, 404);

    // Parse body
    const body = await request.json();
    const { formationId, players } = body;

    if (!formationId || !Array.isArray(players)) {
      return json({ error: 'Formation och spelare krävs' }, 400);
    }

    // Basic validation
    if (players.length !== 11) {
      return json({ error: 'Laget måste ha exakt 11 spelare' }, 400);
    }

    const captains = players.filter((p: any) => p.isCaptain);
    if (captains.length !== 1) {
      return json({ error: 'Laget måste ha exakt en kapten' }, 400);
    }

    const ids = new Set(players.map((p: any) => p.playerId));
    if (ids.size !== players.length) {
      return json({ error: 'Samma spelare kan inte väljas flera gånger' }, 400);
    }

    // Get budget from league config
    const config = await getLeagueConfig();

    // Save team
    team.formationId = formationId;
    team.players = players.map((p: any) => ({
      playerId: p.playerId,
      slotIndex: p.slotIndex,
      isCaptain: !!p.isCaptain,
    }));
    team.updatedAt = new Date().toISOString();

    await putTeam(team);

    return json({
      ok: true,
      teamId: team.teamId,
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
