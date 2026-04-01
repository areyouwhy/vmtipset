import type { APIRoute } from 'astro';
import QRCode from 'qrcode';

const SWISH_DATA = JSON.stringify({
  format: '1',
  payee: { value: '0703064211' },
  amount: { value: 300 },
  message: { value: 'La Copa del Mundo 2026' },
});

export const GET: APIRoute = async () => {
  const png = await QRCode.toBuffer(SWISH_DATA, {
    width: 400,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
