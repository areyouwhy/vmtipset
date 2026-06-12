import type { LeaderboardRow } from "./leaderboard";

/**
 * Pure banter logic for the /hets Text-TV page. No DB, no randomness, no Date —
 * everything is a deterministic function of the leaderboard rows so the same
 * standings always produce the same roast (stable across renders, testable).
 *
 * Read-only: this never touches game state. It only re-shapes the leaderboard
 * into three "Text-TV pages" and attaches a cheeky one-liner per team.
 */

export type HetsAccent = "green" | "cyan" | "red";

export type HetsPage = {
  /** Fake Text-TV page number shown in the chrome (301 / 302 / 303). */
  number: number;
  key: string;
  /** ALL-CAPS tier name, e.g. "GRÄDDAN". */
  title: string;
  /** One-line dig at the whole tier. */
  subtitle: string;
  accent: HetsAccent;
  rows: HetsRow[];
};

export type HetsRow = LeaderboardRow & {
  /** Cheeky Swedish one-liner derived from this team's standing. */
  roast: string;
};

const PAGE_META: Omit<HetsPage, "rows">[] = [
  {
    number: 1,
    key: "gradd",
    title: "GRÄDDAN",
    subtitle: "Finrummet. Här bor de som faktiskt kan något — eller har tur.",
    accent: "green",
  },
  {
    number: 2,
    key: "mellan",
    title: "MELLANMJÖLK",
    subtitle: "Varken eller. Ingen minns en sjua i tabellen.",
    accent: "cyan",
  },
  {
    number: 3,
    key: "skams",
    title: "SKÄMSVRÅN",
    subtitle: "Här nere tutar sirenerna. Du nådde inte ens sida 1.",
    accent: "red",
  },
];

/**
 * Split a sorted array into three contiguous, as-even-as-possible groups.
 * Earlier groups absorb the remainder, so 31 → [11, 10, 10], 32 → [11, 11, 10].
 */
export function splitIntoThirds<T>(items: T[]): [T[], T[], T[]] {
  const n = items.length;
  const base = Math.floor(n / 3);
  const rem = n % 3;
  const sizes = [
    base + (rem > 0 ? 1 : 0),
    base + (rem > 1 ? 1 : 0),
    base,
  ];
  const out: T[][] = [];
  let i = 0;
  for (const size of sizes) {
    out.push(items.slice(i, i + size));
    i += size;
  }
  return [out[0], out[1], out[2]];
}

/**
 * Pick one cheeky line for a team. Signals are checked in priority order and
 * the first match wins, so the line always reflects the team's most notable
 * trait. Tone: teasing, never cruel.
 */
export function roastFor(
  row: LeaderboardRow,
  ctx: { maxRank: number },
): string {
  const hasField = ctx.maxRank > 1;
  const isLast = hasField && row.rank >= ctx.maxRank;

  if (hasField && row.rank === 1) {
    return "Etta. Resten ser mest din rygg just nu.";
  }
  if (isLast) {
    return "Jumbo. Någon måste hålla i jumbolyktan — varsågod.";
  }
  if (row.rankChange !== null && row.rankChange <= -3) {
    return `Rasade ${Math.abs(row.rankChange)} placeringar. Aj då, fritt fall.`;
  }
  if (row.rankChange !== null && row.rankChange >= 3) {
    return `Klättrade ${row.rankChange} steg. Någon har visst vaknat.`;
  }
  if (row.bankSek !== null && row.bankSek < 0) {
    return "Minus på banken. Lever på lånade pengar och hopp.";
  }
  if (row.roundGrowthSek !== null && row.roundGrowthSek < 0) {
    return "Squaden tappar värde. Det där var nog inte planen.";
  }
  if (row.bankSek !== null && row.bankSek > 3_000_000) {
    return "Sitter på en kassakista men vågar inte spendera. Feg.";
  }
  if (row.rankChange === null || row.rankChange === 0) {
    return "Orörlig. Stabilt — eller bara väldigt förutsägbart?";
  }
  return "Helt okej. Vilket ju är det tråkigaste man kan vara.";
}

/**
 * Build the three Text-TV pages from leaderboard rows. Input need not be
 * pre-sorted; output is rank-ascending and split into even thirds.
 */
export function buildHets(rows: LeaderboardRow[]): HetsPage[] {
  const sorted = [...rows].sort(
    (a, b) => a.rank - b.rank || b.totalPointsSek - a.totalPointsSek,
  );
  const maxRank = sorted.reduce((m, r) => Math.max(m, r.rank), 0);
  const thirds = splitIntoThirds(sorted);
  return PAGE_META.map((meta, i) => ({
    ...meta,
    rows: thirds[i].map((row) => ({ ...row, roast: roastFor(row, { maxRank }) })),
  }));
}
