import QRCodeStyling from 'qr-code-styling';
import { JSDOM } from 'jsdom';

const SWISH_DATA = 'C0703064211;300,00;La Copa del Mundo 2026;0';

export type QRStyle = 'celeste' | 'gradient' | 'classic';

const styles: Record<QRStyle, ConstructorParameters<typeof QRCodeStyling>[0]> = {
  // Style 1: Celeste rounded dots on white
  celeste: {
    width: 400,
    height: 400,
    data: SWISH_DATA,
    margin: 16,
    qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions: {
      type: 'rounded',
      color: '#1a6b8a',
    },
    cornersSquareOptions: {
      type: 'extra-rounded',
      color: '#0d4f6b',
    },
    cornersDotOptions: {
      type: 'dot',
      color: '#0d4f6b',
    },
    backgroundOptions: {
      color: '#ffffff',
    },
  },

  // Style 2: Dark blue dots with yellow-to-celeste gradient
  gradient: {
    width: 400,
    height: 400,
    data: SWISH_DATA,
    margin: 16,
    qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions: {
      type: 'dots',
      gradient: {
        type: 'linear',
        rotation: Math.PI / 4,
        colorStops: [
          { offset: 0, color: '#005baa' },
          { offset: 1, color: '#75aadb' },
        ],
      },
    },
    cornersSquareOptions: {
      type: 'extra-rounded',
      gradient: {
        type: 'linear',
        rotation: Math.PI / 4,
        colorStops: [
          { offset: 0, color: '#fecc02' },
          { offset: 1, color: '#f5c518' },
        ],
      },
    },
    cornersDotOptions: {
      type: 'dot',
      color: '#005baa',
    },
    backgroundOptions: {
      color: '#ffffff',
    },
  },

  // Style 3: Classic black rounded dots, clean
  classic: {
    width: 400,
    height: 400,
    data: SWISH_DATA,
    margin: 16,
    qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions: {
      type: 'rounded',
      color: '#1a1a2e',
    },
    cornersSquareOptions: {
      type: 'extra-rounded',
      color: '#111111',
    },
    cornersDotOptions: {
      type: 'dot',
      color: '#111111',
    },
    backgroundOptions: {
      color: '#ffffff',
    },
  },
};

export async function generateStyledQR(style: QRStyle): Promise<string> {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');

  const qr = new QRCodeStyling({
    jsdom: JSDOM,
    nodeCanvas: undefined as any,
    ...styles[style],
    type: 'svg',
  });

  const svgBuffer = await qr.getRawData('svg');
  if (!svgBuffer) throw new Error('Failed to generate QR');
  return Buffer.from(svgBuffer).toString('utf-8');
}
