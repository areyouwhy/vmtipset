import type { APIRoute } from 'astro';
import { makeClearCookie } from '../../../lib/fantasy';

export const POST: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': makeClearCookie(),
    },
  });
};
