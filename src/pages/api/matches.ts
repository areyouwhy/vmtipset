import type { APIRoute } from 'astro';

const API_BASE = 'https://api-manager.aftonbladet.se';
const GAME_ID = 731; // PL Spring 2026 for testing

export const GET: APIRoute = async () => {
  try {
    // Get game to find tournament ID and current round
    const gameRes = await fetch(`${API_BASE}/games/${GAME_ID}`);
    if (!gameRes.ok) throw new Error('Game not found');
    const game = await gameRes.json();

    const tournamentId = game.tournament?.id;
    if (!tournamentId) throw new Error('No tournament');

    const now = new Date().toISOString();
    let currentRound = 0;
    let deadline = '';
    for (let i = 0; i < game.rounds.length; i++) {
      if (game.rounds[i].start <= now && now <= game.rounds[i].end) {
        currentRound = i + 1;
        deadline = game.rounds[i].close;
        break;
      }
    }

    // Get schedule
    const schedRes = await fetch(`${API_BASE}/tournaments/${tournamentId}/schedule`);
    if (!schedRes.ok) throw new Error('Schedule not found');
    const matches: any[] = await schedRes.json();

    // Split into upcoming and recent
    const upcoming: any[] = [];
    const recent: any[] = [];

    for (const m of matches) {
      const start = m.start || '';
      const props = m.properties || {};
      const hasScore = props.homeScore !== undefined && props.homeScore !== '';

      const entry = {
        id: m.id,
        name: m.name,
        start: start,
        homeScore: hasScore ? Number(props.homeScore) : null,
        awayScore: hasScore ? Number(props.awayScore) : null,
        status: m.status,
      };

      if (m.status === 'finished' || hasScore) {
        recent.push(entry);
      } else if (start > now) {
        upcoming.push(entry);
      }
    }

    upcoming.sort((a, b) => a.start.localeCompare(b.start));
    recent.sort((a, b) => b.start.localeCompare(a.start));

    return new Response(JSON.stringify({
      currentRound,
      deadline,
      upcoming: upcoming.slice(0, 15),
      recent: recent.slice(0, 10),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
