import type { APIRoute } from 'astro';
import QRCode from 'qrcode';

// Swish C2B QR format: C<payee>;<amount>;<message>;<lock_mask>
// Amount uses comma as decimal separator per spec.
// Lock mask 0 = all fields locked (payee bit 0, amount bit 1, message bit 2).
// See: Guide Swish QR Code specification v1.7.2, section 6.1
const SWISH_DATA = 'C0703064211;300,00;La Copa del Mundo 2026;0';

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
