import type {
  DataSource,
  ExternalClub,
  ExternalDataset,
  ExternalPlayer,
  ExternalRound,
  ExternalSnapshot,
} from "./types";

/**
 * Mock dataset for the FIFA World Cup 2026 (48-team format).
 *
 * Each "club" is a national team — that's how it works on Aftonbladet's WC
 * manager. Players belong to one nation. We don't model their day-job club
 * here; for WC scoring it's irrelevant.
 *
 * Names are placeholders (`ARG GK`, `BRA DEF 2`, etc.). Easy to scan, easy
 * to grep, and makes it obvious it's not the real squad.
 */

const NATIONS: { code: string; name: string }[] = [
  // CONMEBOL
  { code: "ARG", name: "Argentina" },
  { code: "BRA", name: "Brazil" },
  { code: "URU", name: "Uruguay" },
  { code: "COL", name: "Colombia" },
  { code: "ECU", name: "Ecuador" },
  { code: "PAR", name: "Paraguay" },
  // UEFA
  { code: "FRA", name: "France" },
  { code: "ENG", name: "England" },
  { code: "GER", name: "Germany" },
  { code: "ESP", name: "Spain" },
  { code: "ITA", name: "Italy" },
  { code: "POR", name: "Portugal" },
  { code: "NED", name: "Netherlands" },
  { code: "BEL", name: "Belgium" },
  { code: "CRO", name: "Croatia" },
  { code: "POL", name: "Poland" },
  { code: "DEN", name: "Denmark" },
  { code: "SUI", name: "Switzerland" },
  { code: "SRB", name: "Serbia" },
  { code: "WAL", name: "Wales" },
  { code: "UKR", name: "Ukraine" },
  { code: "NOR", name: "Norway" },
  // CONCACAF (incl. hosts USA/CAN/MEX)
  { code: "USA", name: "USA" },
  { code: "CAN", name: "Canada" },
  { code: "MEX", name: "Mexico" },
  { code: "CRC", name: "Costa Rica" },
  { code: "JAM", name: "Jamaica" },
  { code: "PAN", name: "Panama" },
  // AFC
  { code: "JPN", name: "Japan" },
  { code: "KOR", name: "South Korea" },
  { code: "IRN", name: "Iran" },
  { code: "AUS", name: "Australia" },
  { code: "KSA", name: "Saudi Arabia" },
  { code: "IRQ", name: "Iraq" },
  { code: "UAE", name: "UAE" },
  { code: "JOR", name: "Jordan" },
  { code: "UZB", name: "Uzbekistan" },
  // CAF
  { code: "SEN", name: "Senegal" },
  { code: "MAR", name: "Morocco" },
  { code: "EGY", name: "Egypt" },
  { code: "GHA", name: "Ghana" },
  { code: "NGA", name: "Nigeria" },
  { code: "CIV", name: "Ivory Coast" },
  { code: "CMR", name: "Cameroon" },
  { code: "ALG", name: "Algeria" },
  { code: "RSA", name: "South Africa" },
  { code: "TUN", name: "Tunisia" },
  // OFC
  { code: "NZL", name: "New Zealand" },
];

const POSITION_SLOTS = [
  "GK",
  "DEF",
  "DEF",
  "DEF",
  "MID",
  "MID",
  "MID",
  "FWD",
  "FWD",
  "FWD",
] as const;

// Tuned so a cheapest-legal 4-3-3 (1 GK + 4 cheap DEF + 3 cheap MID + 3 cheap FWD)
// = 4.5 + 4×3.5 + 3×3.5 + 3×4.5 = 42.5M, leaving ~7.5M to upgrade. Premium
// squads blow well past 50M, forcing trade-offs.
const PRICE_BY_POSITION_RANK: Record<
  "GK" | "DEF" | "MID" | "FWD",
  number[]
> = {
  GK: [4_500_000],
  DEF: [5_500_000, 4_500_000, 3_500_000],
  MID: [7_000_000, 5_000_000, 3_500_000],
  FWD: [11_000_000, 7_000_000, 4_500_000],
};

// Strength factor per nation (0.7 — 1.4) gives top teams pricier players, weaker
// teams cheaper. Indexed by NATIONS order; deterministic for testing.
const STRENGTH_BY_INDEX: Record<number, number> = {
  0: 1.4, // ARG
  1: 1.4, // BRA
  6: 1.4, // FRA
  7: 1.35, // ENG
  8: 1.3, // GER
  9: 1.3, // ESP
  11: 1.25, // POR
  12: 1.25, // NED
  // unspecified entries fall back to base of ~1.0 with mild noise below.
};

const clubs: ExternalClub[] = NATIONS.map((n) => ({
  externalId: `club:${n.code.toLowerCase()}`,
  name: n.name,
  shortName: n.code,
  countryCode: n.code,
}));

const players: ExternalPlayer[] = NATIONS.flatMap((n) => {
  const slug = n.code.toLowerCase();
  return POSITION_SLOTS.map((pos, i) => ({
    externalId: `p:${slug}-${i + 1}`,
    name: `${n.code} ${pos}${posIndexLabel(POSITION_SLOTS, i)}`,
    clubExternalId: `club:${slug}`,
    position: pos,
  }));
});

function posIndexLabel(
  slots: readonly ("GK" | "DEF" | "MID" | "FWD")[],
  i: number,
): string {
  const pos = slots[i];
  // Index within same position: how many of `pos` came before i
  let idx = 0;
  for (let k = 0; k <= i; k++) if (slots[k] === pos) idx++;
  // GK only one — drop the trailing index for readability.
  return pos === "GK" ? "" : ` ${idx}`;
}

// Rounds — World Cup 2026 has Group Stage (3 matchdays), R32, R16, QF, SF, F.
// We mock 3 group rounds for now; knockouts can be added when the round
// lifecycle / scoring engine lands (Epic 7).
const rounds: ExternalRound[] = [
  { externalId: "r:1", number: 1, name: "Group MD1", deadline: "2026-06-12T17:00:00Z" },
  { externalId: "r:2", number: 2, name: "Group MD2", deadline: "2026-06-17T17:00:00Z" },
  { externalId: "r:3", number: 3, name: "Group MD3", deadline: "2026-06-22T17:00:00Z" },
];

// Deterministic pseudo-random — fixed seed so mock data is stable across runs.
function pseudoRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map to [0, 1)
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

const snapshots: ExternalSnapshot[] = [];

// Round 1 baseline — price tier × nation strength.
for (let nationIdx = 0; nationIdx < NATIONS.length; nationIdx++) {
  const n = NATIONS[nationIdx];
  const strength =
    STRENGTH_BY_INDEX[nationIdx] ?? 0.85 + pseudoRandom(n.code) * 0.3; // 0.85 — 1.15
  POSITION_SLOTS.forEach((pos, i) => {
    let rank = 0;
    if (pos !== "GK") {
      // rank: 0 (premium) for first of position, 2 (cheap) for last
      const sameBefore = POSITION_SLOTS.slice(0, i).filter(
        (p) => p === pos,
      ).length;
      rank = sameBefore;
    }
    const baseTier = PRICE_BY_POSITION_RANK[pos][rank] ?? 4_000_000;
    const priceSek = Math.round((baseTier * strength) / 100_000) * 100_000;
    snapshots.push({
      playerExternalId: `p:${n.code.toLowerCase()}-${i + 1}`,
      roundExternalId: "r:1",
      priceSek,
      growthSek: 0,
    });
  });
}

// Rounds 2 & 3 — simulated growth per player. Strong positive bias for
// "in-form" players (a deterministic subset), small noise for the rest.
for (const round of ["r:2", "r:3"]) {
  for (const baseline of snapshots.filter((s) => s.roundExternalId === "r:1")) {
    const seed = `${baseline.playerExternalId}::${round}`;
    const noise = (pseudoRandom(seed) - 0.5) * 600_000; // ±300k
    const inForm = pseudoRandom(`${seed}::form`) > 0.85; // ~15% in-form per round
    const formBonus = inForm ? 600_000 + pseudoRandom(seed) * 600_000 : 0;
    const growthSek = Math.round((noise + formBonus) / 50_000) * 50_000;
    const previous = (() => {
      // Find latest snapshot for this player before this round
      const prior = snapshots
        .filter(
          (s) =>
            s.playerExternalId === baseline.playerExternalId &&
            s.roundExternalId !== round &&
            s.roundExternalId < round,
        )
        .sort((a, b) => a.roundExternalId.localeCompare(b.roundExternalId))
        .at(-1);
      return prior?.priceSek ?? baseline.priceSek;
    })();
    snapshots.push({
      playerExternalId: baseline.playerExternalId,
      roundExternalId: round,
      priceSek: previous + growthSek,
      growthSek,
    });
  }
}

export const mockDataset: ExternalDataset = {
  clubs,
  players,
  rounds,
  snapshots,
};

export const mockSource: DataSource = {
  id: "mock",
  async fetchAll() {
    return mockDataset;
  },
};
