import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { pin } = await request.json();
    const adminPin = import.meta.env.ADMIN_PIN || process.env.ADMIN_PIN || '';

    if (!pin || pin !== adminPin) {
      return json({ error: 'Fel admin-PIN' }, 401);
    }

    return json({ ok: true }, 200);
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
