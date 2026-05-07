export const SWISH_PHONE = "0703064211";
export const SWISH_AMOUNT_SEK = 300;

export function buildSwishPayload(message: string): string {
  // Swish C2B QR payload format:
  // C{phone};{amount};{message};{lock_phone}{lock_amount}{lock_message}
  // Lock flags: 0=editable, 1=locked. We lock phone+amount, leave message editable as a fallback.
  const sanitized = message.replace(/[;\n]/g, " ").slice(0, 50);
  return `C${SWISH_PHONE};${SWISH_AMOUNT_SEK};${sanitized};0`;
}
