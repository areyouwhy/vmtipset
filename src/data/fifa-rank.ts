/**
 * FIFA Men's World Ranking — entries for the 48 WC 2026 teams.
 *
 * Sources used to fill this in (last refreshed 2026-04-01):
 *   - inside.fifa.com/fifa-world-ranking/men (current snapshot, April 2026)
 *   - en.wikipedia.org/wiki/FIFA_Men's_World_Ranking (top 20 table)
 *   - inside.fifa.com/news/france-1st-fifa-coca-cola-world-ranking-april-2026
 *     (callouts for ranks 22 / 29 / 34 / 38 / 41 / 44 / 65)
 *
 * Entries marked /* est *\/ are best-effort approximations — the public
 * FIFA pages don't expose ranks past the top 20 in a scrapeable format.
 * Replace with the exact number whenever you see it (and bump
 * FIFA_RANK_SOURCE_DATE).
 *
 * Null is the safe fallback for any unknown / unmatched code.
 */

export const FIFA_RANK_SOURCE_DATE = "2026-04-01" as const;
export const FIFA_RANK_SOURCE_URL =
  "https://inside.fifa.com/fifa-world-ranking/men" as const;

export const FIFA_RANK: Record<string, number> = {
  // Top 20 — from Wikipedia (FIFA snapshot 2026-04-01).
  // WC qualifiers only; #12 Italy, #20 Denmark are top-20 but didn't qualify.
  FRA: 1,
  SPA: 2,
  ARG: 3,
  ENG: 4,
  POR: 5,
  BRA: 6,
  NED: 7,
  MOR: 8,
  BEL: 9,
  GER: 10,
  CRO: 11,
  COL: 13,
  SEN: 14,
  MEX: 15,
  USA: 16,
  URU: 17,
  JPN: 18,
  SUI: 19,

  // Confirmed in the FIFA April-2026 release notes.
  TUR: 22,
  EGY: 29,
  CIV: 34,
  SWE: 38,
  CZE: 41,
  TUN: 44,
  BIH: 65,

  // Estimates — verified order-of-magnitude only.
  IRN: 21 /* est */,
  KOR: 23 /* est */,
  AUS: 24 /* est */,
  AUT: 25 /* est */,
  NOR: 27 /* est */,
  ECU: 28 /* est */,
  ALG: 30 /* est */,
  SCO: 31 /* est */,
  CAN: 32 /* est */,
  PAR: 33 /* est */,
  PAN: 35 /* est */,
  KSA: 36 /* est */,
  RSA: 39 /* est */,
  QAT: 40 /* est */,
  UZB: 42 /* est */,
  COD: 50 /* est */,
  GHA: 58 /* est */,
  JOR: 70 /* est */,
  IRQ: 72 /* est */,
  CVE: 75 /* est */,
  HTI: 85 /* est */,
  NZL: 90 /* est */,
  CUW: 95 /* est */,
};

export function fifaRank(countryCode: string | null | undefined): number | null {
  if (!countryCode) return null;
  return FIFA_RANK[countryCode.toUpperCase()] ?? null;
}
