/**
 * Country (FIFA) code → baked jersey SVG.
 * SVGs are scraped from Aftonbladet's Swush composer and committed under
 * public/img/jerseys/. Returns null for unknown codes so callers can fall
 * back to a placeholder.
 */
const HAS_JERSEY: ReadonlySet<string> = new Set([
  "ALG","ARG","AUS","AUT","BEL","BIH","BRA","CAN","CIV","COD","COL","CRO",
  "CUW","CVE","CZE","ECU","EGY","ENG","FRA","GER","GHA","HTI","IRN","IRQ",
  "JOR","JPN","KOR","KSA","MEX","MOR","NED","NOR","NZL","PAN","PAR","POR",
  "QAT","RSA","SCO","SEN","SPA","SUI","SWE","TUN","TUR","URU","USA","UZB",
]);

export function jerseyPath(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null;
  const code = countryCode.toUpperCase();
  return HAS_JERSEY.has(code) ? `/img/jerseys/${code}.svg` : null;
}

export function hasJersey(countryCode: string | null | undefined): boolean {
  return jerseyPath(countryCode) !== null;
}
