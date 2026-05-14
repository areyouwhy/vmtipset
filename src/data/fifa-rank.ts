/**
 * FIFA Men's World Ranking, scoped to the 48 WC 2026 teams.
 *
 * Static/curated: update by hand when FIFA publishes a new ranking
 * (roughly monthly). The exact numbers below are approximations of
 * the most recent ranking at the time of writing — feel free to
 * adjust as the real numbers shift.
 *
 * The `null` fallback is intentional: any team missing from this map
 * will render with "—" rather than crash.
 */

export const FIFA_RANK_SOURCE_DATE = "2026-04-03" as const;
export const FIFA_RANK_SOURCE_URL =
  "https://inside.fifa.com/fifa-world-ranking/men" as const;

export const FIFA_RANK: Record<string, number> = {
  ARG: 1,
  FRA: 2,
  SPA: 3,
  ENG: 4,
  BRA: 5,
  POR: 6,
  NED: 7,
  COL: 8,
  BEL: 9,
  CRO: 10,
  MOR: 11,
  GER: 12,
  URU: 13,
  USA: 14,
  SUI: 15,
  SEN: 16,
  JPN: 17,
  IRN: 18,
  MEX: 19,
  KOR: 20,
  ECU: 21,
  NOR: 22,
  AUT: 23,
  SWE: 24,
  TUR: 25,
  AUS: 26,
  TUN: 27,
  EGY: 28,
  CIV: 29,
  ALG: 30,
  PAR: 31,
  PAN: 32,
  CAN: 33,
  SCO: 34,
  KSA: 35,
  CZE: 36,
  QAT: 37,
  BIH: 38,
  RSA: 39,
  IRQ: 40,
  GHA: 41,
  UZB: 42,
  JOR: 43,
  NZL: 44,
  COD: 45,
  HTI: 46,
  CVE: 47,
  CUW: 48,
};

export function fifaRank(countryCode: string | null | undefined): number | null {
  if (!countryCode) return null;
  return FIFA_RANK[countryCode.toUpperCase()] ?? null;
}
