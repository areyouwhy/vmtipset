import type { APIRoute } from 'astro';
import { generateStyledQR, type QRStyle } from '../../lib/qr-styled';

const VALID_STYLES: QRStyle[] = ['celeste', 'gradient', 'classic'];

export const GET: APIRoute = async ({ url }) => {
  const style = (url.searchParams.get('style') || 'celeste') as QRStyle;

  if (!VALID_STYLES.includes(style)) {
    return new Response('Invalid style', { status: 400 });
  }

  const svg = await generateStyledQR(style);

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
