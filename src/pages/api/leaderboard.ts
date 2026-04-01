import type { APIRoute } from 'astro';

const API_BASE = 'https://api-manager.aftonbladet.se';

// TODO: Replace with VM-elvan 2026 competition ID when available
const COMPETITION_ID = 667074; // Allsvenskan 2026 "Bönas ligan" for testing

interface FantasyTeamValue {
  round: number;
  value: number;
  growth: number;
}

interface Enrollment {
  fantasyTeam: {
    id: number;
    name: string;
    user: {
      username: string;
      imageUrl?: string;
    };
  };
}

interface EnrollmentsResponse {
  count: number;
  items: { fantasyTeam: Enrollment['fantasyTeam'] }[];
  links: { next?: string };
}

export const GET: APIRoute = async () => {
  try {
    // Fetch all enrollments (paginated)
    const allEnrollments: Enrollment['fantasyTeam'][] = [];
    let page = 1;
    const pageSize = 50;

    while (true) {
      const res = await fetch(
        `${API_BASE}/competitions/${COMPETITION_ID}/enrollments?page=${page}&pageSize=${pageSize}`
      );
      if (!res.ok) throw new Error(`Enrollments failed: ${res.status}`);
      const data: EnrollmentsResponse = await res.json();

      for (const item of data.items) {
        allEnrollments.push(item.fantasyTeam);
      }

      if (!data.links.next || data.items.length < pageSize) break;
      page++;
    }

    // Fetch values for each team in parallel
    const teamResults = await Promise.all(
      allEnrollments.map(async (team) => {
        try {
          const res = await fetch(`${API_BASE}/fantasyteams/${team.id}/values`);
          if (!res.ok) return { team, value: 0, growth: 0, round: 0 };
          const values: FantasyTeamValue[] = await res.json();
          const latest = values.length > 0 ? values[values.length - 1] : { value: 0, growth: 0, round: 0 };
          return {
            team,
            value: latest.value,
            growth: latest.growth,
            round: latest.round,
          };
        } catch {
          return { team, value: 0, growth: 0, round: 0 };
        }
      })
    );

    // Sort by growth (points earned), then by value as tiebreaker
    teamResults.sort((a, b) => b.growth - a.growth || b.value - a.value);

    const leaderboard = teamResults.map((entry, i) => ({
      position: i + 1,
      teamName: entry.team.name,
      manager: entry.team.user.username,
      value: entry.value,
      growth: entry.growth,
      round: entry.round,
    }));

    return new Response(JSON.stringify({ leaderboard, count: leaderboard.length }), {
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
