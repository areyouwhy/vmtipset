import type { APIRoute } from 'astro';

const API_BASE = 'https://api-manager.aftonbladet.se';
const GAME_ID = '731';

let cachedPlayers: any[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export const GET: APIRoute = async () => {
  try {
    if (cachedPlayers && Date.now() - cacheTime < CACHE_TTL) {
      return new Response(JSON.stringify(cachedPlayers), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch game metadata to find latest round
    const gameRes = await fetch(`${API_BASE}/games/${GAME_ID}`);
    const game = gameRes.ok ? await gameRes.json() : { rounds: [] };
    const rounds: { start: string; end: string }[] = game.rounds || [];
    // Find latest completed round (end date in the past)
    const now = Date.now();
    let latestRound = 1;
    for (let i = 0; i < rounds.length; i++) {
      if (new Date(rounds[i].end).getTime() <= now) latestRound = i + 1;
    }

    // Fetch all game players + bulk round values in parallel
    const [playersRes, roundValuesRes] = await Promise.all([
      fetch(`${API_BASE}/games/${GAME_ID}/players?limit=1000`),
      fetch(`${API_BASE}/games/${GAME_ID}/rounds/${latestRound}/players`),
    ]);

    if (!playersRes.ok) throw new Error('Failed to fetch players');
    const rawPlayers: any[] = await playersRes.json();

    // Parse bulk values into a map
    const valueMap: Record<number, {
      value: number;
      growth: number;
      totalGrowth: number;
      popularity: number;
      trend: number;
    }> = {};
    if (roundValuesRes.ok) {
      const roundValues: any[] = await roundValuesRes.json();
      for (const rv of roundValues) {
        const pid = rv.player?.id ?? rv.player;
        valueMap[pid] = {
          value: rv.value || 0,
          growth: rv.growth || 0,
          totalGrowth: rv.totalGrowth || 0,
          popularity: rv.popularity || 0,
          trend: rv.trend || 0,
        };
      }
    }

    // Fetch all unique teams (only ~20)
    const teamIds = [...new Set(rawPlayers.map(p => p.team.id))];
    const teamMap: Record<number, { name: string; abbreviation: string }> = {};
    await Promise.all(
      teamIds.map(async (tid) => {
        try {
          const res = await fetch(`${API_BASE}/teams/${tid}`);
          const data = await res.json();
          teamMap[tid] = { name: data.name, abbreviation: data.abbreviation };
        } catch {
          teamMap[tid] = { name: 'Okänd', abbreviation: '???' };
        }
      })
    );

    // Fetch all persons in parallel batches
    const BATCH_SIZE = 80;
    const personMap: Record<number, { fullName: string; skinColor: string | null; hairColor: string | null }> = {};

    for (let i = 0; i < rawPlayers.length; i += BATCH_SIZE) {
      const batch = rawPlayers.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (p: any) => {
          const pid = p.person.id;
          if (personMap[pid]) return;
          try {
            const res = await fetch(`${API_BASE}/persons/${pid}`);
            const data = await res.json();
            personMap[pid] = {
              fullName: data.fullName,
              skinColor: data.properties?.skinColor || null,
              hairColor: data.properties?.hairColor || null,
            };
          } catch {
            personMap[pid] = { fullName: 'Okänd', skinColor: null, hairColor: null };
          }
        })
      );
    }

    // Build result
    const players = rawPlayers.map((p: any) => {
      const person = personMap[p.person.id];
      const team = teamMap[p.team.id];
      const vals = valueMap[p.id];
      return {
        playerId: p.id,
        name: person?.fullName || 'Okänd',
        club: team?.name || 'Okänd',
        clubAbbr: team?.abbreviation || '???',
        position: p.position.id,
        skinColor: person?.skinColor || null,
        hairColor: person?.hairColor || null,
        value: vals?.value || 0,
        growth: vals?.growth || 0,
        totalGrowth: vals?.totalGrowth || 0,
        popularity: vals?.popularity || 0,
        trend: vals?.trend || 0,
      };
    });

    // Default sort by total growth descending
    players.sort((a: any, b: any) => b.totalGrowth - a.totalGrowth);

    cachedPlayers = players;
    cacheTime = Date.now();

    return new Response(JSON.stringify(players), {
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
