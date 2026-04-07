import type { APIRoute } from 'astro';

const API_BASE = 'https://api-manager.aftonbladet.se';
const RULESET_ID = '193';

let cachedRuleset: any = null;

export const GET: APIRoute = async () => {
  try {
    if (cachedRuleset) {
      return new Response(JSON.stringify(cachedRuleset), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`${API_BASE}/rulesets/${RULESET_ID}`);
    if (!res.ok) throw new Error('Failed to fetch ruleset');

    const ruleset = await res.json();

    cachedRuleset = {
      formations: (ruleset.formations || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        slots: (f.slots || []).map((s: any) => ({
          x: s.x,
          y: s.y,
          positionId: s.position?.id ?? s.position,
        })),
      })),
      positions: (ruleset.positions || []).map((p: any) => ({
        id: p.id,
        name: p.name,
      })),
      fantasyEventTypes: (ruleset.fantasyEventTypes || []).map((e: any) => ({
        id: e.id,
        name: e.name,
        value: e.value,
      })),
    };

    return new Response(JSON.stringify(cachedRuleset), {
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
