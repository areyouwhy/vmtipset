import type { APIRoute } from 'astro';
import { getLeagueConfig, putLeagueConfig } from '../../../../lib/fantasy';

export const GET: APIRoute = async () => {
  try {
    const config = await getLeagueConfig();
    return json(config, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { pin, config } = body;

    const adminPin = import.meta.env.ADMIN_PIN || process.env.ADMIN_PIN || '';
    if (!pin || pin !== adminPin) {
      return json({ error: 'Fel admin-PIN' }, 401);
    }

    if (!config || typeof config !== 'object') {
      return json({ error: 'Ogiltig konfiguration' }, 400);
    }

    const current = await getLeagueConfig();
    const updated = { ...current, ...config };
    await putLeagueConfig(updated);

    return json(updated, 200);
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
