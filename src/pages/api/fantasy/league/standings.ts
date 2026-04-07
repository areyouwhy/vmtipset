import type { APIRoute } from 'astro';
import { head } from '@vercel/blob';
import { listTeams } from '../../../../lib/fantasy';

export const GET: APIRoute = async () => {
  try {
    const teams = await listTeams();
    const approved = teams.filter(t => (t.status || 'approved') === 'approved');

    // Try to load cached scores
    let scores: Record<string, any> = {};
    try {
      const meta = await head('league/scores.json');
      const res = await fetch(meta.url);
      if (res.ok) scores = await res.json();
    } catch { /* no scores yet */ }

    // Build standings merging team data with scores
    const standings = approved.map(t => {
      const teamScores = scores[t.teamId];
      return {
        teamId: t.teamId,
        teamName: t.teamName,
        playerCount: t.players.length,
        formationId: t.formationId,
        players: t.players,
        totalGrowth: teamScores?.totalGrowth || 0,
        rounds: teamScores?.rounds || [],
      };
    });

    // Sort by total growth descending
    standings.sort((a, b) => b.totalGrowth - a.totalGrowth);

    // Add positions
    const withPositions = standings.map((t, i) => ({
      ...t,
      position: i + 1,
    }));

    return new Response(JSON.stringify({ standings: withPositions }), {
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
