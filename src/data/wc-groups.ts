/**
 * 2026 FIFA World Cup group stage — 48 teams in 12 groups of 4.
 *
 * Placeholder draw based on standard pot rules (hosts Mexico/USA/Canada
 * in Pot 1 + 9 highest-ranked teams; remaining pots by rank, one team
 * per pot in each group). Confederation separation rules aren't
 * enforced here — update with the actual draw when FIFA publishes it.
 *
 * Each group winner + each runner-up + the 8 best third-placed teams
 * advance to the Round of 32.
 */

export const GROUP_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export const GROUPS: Record<GroupKey, string[]> = {
  A: ["MEX", "CRO", "SWE", "QAT"],
  B: ["USA", "MOR", "TUR", "BIH"],
  C: ["CAN", "GER", "AUS", "RSA"],
  D: ["ARG", "URU", "TUN", "IRQ"],
  E: ["FRA", "SUI", "EGY", "GHA"],
  F: ["SPA", "SEN", "CIV", "UZB"],
  G: ["ENG", "JPN", "ALG", "JOR"],
  H: ["BRA", "IRN", "PAR", "NZL"],
  I: ["POR", "KOR", "PAN", "COD"],
  J: ["NED", "ECU", "SCO", "HTI"],
  K: ["COL", "NOR", "KSA", "CVE"],
  L: ["BEL", "AUT", "CZE", "CUW"],
};

export const COUNTRY_TO_GROUP: Record<string, GroupKey> = (() => {
  const out: Record<string, GroupKey> = {};
  for (const key of GROUP_KEYS) {
    for (const code of GROUPS[key]) {
      out[code] = key;
    }
  }
  return out;
})();

export function groupForCountry(
  countryCode: string | null | undefined,
): GroupKey | null {
  if (!countryCode) return null;
  return COUNTRY_TO_GROUP[countryCode.toUpperCase()] ?? null;
}
