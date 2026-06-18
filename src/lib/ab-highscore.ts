/**
 * Read Aftonbladet's public WC-fantasy highscore (all ~36k teams) so we can
 * show where one of our teams' value would rank in their league.
 *
 * Undocumented Swush endpoint: GET manager.aftonbladet.se/api/games/735/highscore
 * (public, no auth). Returns teams sorted by value with rankByValue. pageSize is
 * capped at ~99/page, so we sample pages GEOMETRICALLY (dense at the top, where
 * our teams sit) to build a value→rank curve, cached hourly. Best-effort: any
 * failure returns null and the UI just hides the stat — never breaks the page.
 */

import { unstable_cache } from "next/cache";

const GAME_ID = process.env.AFTONBLADET_GAME_ID ?? "735";
const BASE = "https://manager.aftonbladet.se/api";

// Geometric page sampling: tight near the top (our ~50–53M teams live there),
// sparse toward the long tail.
const SAMPLE_PAGES = [
  1, 2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 126, 158,
  200, 251, 316, 371,
];

export type AbCurve = {
  total: number;
  /** Value of the #1 team. */
  topValue: number;
  /** (rank, value) anchors, ascending by rank (descending by value). */
  anchors: { rank: number; value: number }[];
};

type RawHs = { rankByValue: number; value: number };

async function fetchPage(
  page: number,
): Promise<{ total: number; rows: RawHs[] } | null> {
  try {
    const res = await fetch(
      `${BASE}/games/${GAME_ID}/highscore?page=${page}&pageSize=99`,
      {
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
        next: { revalidate: 3600 },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: { count: number; highscores: RawHs[] }[];
    };
    const item = json.items?.[0];
    if (!item || !item.highscores?.length) return null;
    return { total: item.count, rows: item.highscores };
  } catch {
    return null;
  }
}

async function _getAbCurve(): Promise<AbCurve | null> {
  const pages = await Promise.all(SAMPLE_PAGES.map(fetchPage));
  const ok = pages.filter((p): p is { total: number; rows: RawHs[] } => !!p);
  if (ok.length === 0) return null;

  const total = ok[0].total;
  // First + last row of each sampled page are our (rank, value) anchors.
  const byRank = new Map<number, number>();
  for (const pg of ok) {
    const first = pg.rows[0];
    const last = pg.rows[pg.rows.length - 1];
    byRank.set(first.rankByValue, first.value);
    byRank.set(last.rankByValue, last.value);
  }
  const anchors = [...byRank.entries()]
    .map(([rank, value]) => ({ rank, value }))
    .sort((a, b) => a.rank - b.rank);
  if (anchors.length === 0) return null;

  return { total, topValue: anchors[0].value, anchors };
}

export const getAbCurve = unstable_cache(_getAbCurve, ["ab-highscore"], {
  revalidate: 3600,
  tags: ["ab-highscore"],
});

export type AbRank = { rank: number; percentile: number; total: number };

/** Interpolate the rank a given team value would hold in Aftonbladet's league.
 *  percentile = top-X% (rank / total × 100). */
export function rankForValue(curve: AbCurve, valueSek: number): AbRank {
  const a = curve.anchors;
  const pct = (rank: number) => (rank / curve.total) * 100;
  if (valueSek >= a[0].value) return { rank: 1, percentile: pct(1), total: curve.total };
  for (let i = 0; i < a.length - 1; i++) {
    const hi = a[i]; // higher value, lower rank
    const lo = a[i + 1]; // lower value, higher rank
    if (valueSek <= hi.value && valueSek >= lo.value) {
      const span = hi.value - lo.value || 1;
      const frac = (hi.value - valueSek) / span;
      const rank = Math.max(1, Math.round(hi.rank + frac * (lo.rank - hi.rank)));
      return { rank, percentile: pct(rank), total: curve.total };
    }
  }
  return { rank: curve.total, percentile: 100, total: curve.total };
}

/** Convenience: curve + interpolation in one call. null on any fetch failure. */
export async function getAbRank(valueSek: number): Promise<AbRank | null> {
  const curve = await getAbCurve();
  if (!curve) return null;
  return rankForValue(curve, valueSek);
}
