import type {
  DataSource,
  ExternalClub,
  ExternalDataset,
  ExternalPlayer,
  ExternalRound,
  ExternalSnapshot,
} from "./types";

/**
 * Hand-crafted placeholder dataset used in tests and local dev before the real
 * Aftonbladet API is wired up. Loosely modeled on a few PL clubs so it feels
 * familiar; the actual values are arbitrary.
 */

const clubs: ExternalClub[] = [
  { externalId: "club:liv", name: "Liverpool", shortName: "LIV", countryCode: "ENG" },
  { externalId: "club:ars", name: "Arsenal", shortName: "ARS", countryCode: "ENG" },
  { externalId: "club:mci", name: "Manchester City", shortName: "MCI", countryCode: "ENG" },
  { externalId: "club:bay", name: "Bayern München", shortName: "BAY", countryCode: "GER" },
];

// Per-club squad: 1 GK, 3 DEF, 3 MID, 3 FWD = 10 players × 4 clubs = 40.
// Prices roughly tracking PL Manager ranges: 3M–13M per player.
const players: ExternalPlayer[] = [
  // Liverpool
  { externalId: "p:liv-gk1", name: "Alisson", clubExternalId: "club:liv", position: "GK" },
  { externalId: "p:liv-def1", name: "Van Dijk", clubExternalId: "club:liv", position: "DEF" },
  { externalId: "p:liv-def2", name: "Robertson", clubExternalId: "club:liv", position: "DEF" },
  { externalId: "p:liv-def3", name: "Konaté", clubExternalId: "club:liv", position: "DEF" },
  { externalId: "p:liv-mid1", name: "MacAllister", clubExternalId: "club:liv", position: "MID" },
  { externalId: "p:liv-mid2", name: "Szoboszlai", clubExternalId: "club:liv", position: "MID" },
  { externalId: "p:liv-mid3", name: "Gravenberch", clubExternalId: "club:liv", position: "MID" },
  { externalId: "p:liv-fwd1", name: "Salah", clubExternalId: "club:liv", position: "FWD" },
  { externalId: "p:liv-fwd2", name: "Núñez", clubExternalId: "club:liv", position: "FWD" },
  { externalId: "p:liv-fwd3", name: "Díaz", clubExternalId: "club:liv", position: "FWD" },
  // Arsenal
  { externalId: "p:ars-gk1", name: "Raya", clubExternalId: "club:ars", position: "GK" },
  { externalId: "p:ars-def1", name: "Saliba", clubExternalId: "club:ars", position: "DEF" },
  { externalId: "p:ars-def2", name: "Gabriel", clubExternalId: "club:ars", position: "DEF" },
  { externalId: "p:ars-def3", name: "White", clubExternalId: "club:ars", position: "DEF" },
  { externalId: "p:ars-mid1", name: "Ødegaard", clubExternalId: "club:ars", position: "MID" },
  { externalId: "p:ars-mid2", name: "Rice", clubExternalId: "club:ars", position: "MID" },
  { externalId: "p:ars-mid3", name: "Havertz", clubExternalId: "club:ars", position: "MID" },
  { externalId: "p:ars-fwd1", name: "Saka", clubExternalId: "club:ars", position: "FWD" },
  { externalId: "p:ars-fwd2", name: "Martinelli", clubExternalId: "club:ars", position: "FWD" },
  { externalId: "p:ars-fwd3", name: "Jesus", clubExternalId: "club:ars", position: "FWD" },
  // Man City
  { externalId: "p:mci-gk1", name: "Ederson", clubExternalId: "club:mci", position: "GK" },
  { externalId: "p:mci-def1", name: "Dias", clubExternalId: "club:mci", position: "DEF" },
  { externalId: "p:mci-def2", name: "Aké", clubExternalId: "club:mci", position: "DEF" },
  { externalId: "p:mci-def3", name: "Walker", clubExternalId: "club:mci", position: "DEF" },
  { externalId: "p:mci-mid1", name: "Rodri", clubExternalId: "club:mci", position: "MID" },
  { externalId: "p:mci-mid2", name: "De Bruyne", clubExternalId: "club:mci", position: "MID" },
  { externalId: "p:mci-mid3", name: "Foden", clubExternalId: "club:mci", position: "MID" },
  { externalId: "p:mci-fwd1", name: "Haaland", clubExternalId: "club:mci", position: "FWD" },
  { externalId: "p:mci-fwd2", name: "Doku", clubExternalId: "club:mci", position: "FWD" },
  { externalId: "p:mci-fwd3", name: "Álvarez", clubExternalId: "club:mci", position: "FWD" },
  // Bayern
  { externalId: "p:bay-gk1", name: "Neuer", clubExternalId: "club:bay", position: "GK" },
  { externalId: "p:bay-def1", name: "Kim", clubExternalId: "club:bay", position: "DEF" },
  { externalId: "p:bay-def2", name: "Davies", clubExternalId: "club:bay", position: "DEF" },
  { externalId: "p:bay-def3", name: "Upamecano", clubExternalId: "club:bay", position: "DEF" },
  { externalId: "p:bay-mid1", name: "Kimmich", clubExternalId: "club:bay", position: "MID" },
  { externalId: "p:bay-mid2", name: "Musiala", clubExternalId: "club:bay", position: "MID" },
  { externalId: "p:bay-mid3", name: "Sané", clubExternalId: "club:bay", position: "MID" },
  { externalId: "p:bay-fwd1", name: "Kane", clubExternalId: "club:bay", position: "FWD" },
  { externalId: "p:bay-fwd2", name: "Gnabry", clubExternalId: "club:bay", position: "FWD" },
  { externalId: "p:bay-fwd3", name: "Tel", clubExternalId: "club:bay", position: "FWD" },
];

const rounds: ExternalRound[] = [
  { externalId: "r:1", number: 1, name: "Round 1", deadline: "2026-06-12T19:00:00Z" },
  { externalId: "r:2", number: 2, name: "Round 2", deadline: "2026-06-19T19:00:00Z" },
];

// Generate a baseline snapshot per player at round 1, with prices that allow
// a 50M squad. Only a handful of players get round-2 deltas — illustrative.
const PRICE_BY_POSITION_RANK: Record<
  "GK" | "DEF" | "MID" | "FWD",
  number[]
> = {
  GK: [5_500_000],
  DEF: [6_500_000, 5_000_000, 4_000_000],
  MID: [9_000_000, 7_500_000, 5_500_000],
  FWD: [13_000_000, 9_500_000, 6_500_000],
};

const snapshots: ExternalSnapshot[] = [];
const positionCounters: Record<string, number> = {};
for (const p of players) {
  const key = `${p.clubExternalId}:${p.position}`;
  const rank = positionCounters[key] ?? 0;
  positionCounters[key] = rank + 1;
  const priceSek = PRICE_BY_POSITION_RANK[p.position][rank] ?? 4_000_000;
  snapshots.push({
    playerExternalId: p.externalId,
    roundExternalId: "r:1",
    priceSek,
    growthSek: 0,
  });
}

// A few illustrative round-2 deltas — only for "in-form" picks.
const round2Movers: { id: string; growth: number }[] = [
  { id: "p:liv-fwd1", growth: 200_000 },
  { id: "p:ars-fwd1", growth: -100_000 },
  { id: "p:mci-fwd1", growth: 300_000 },
  { id: "p:bay-fwd1", growth: 250_000 },
];
for (const m of round2Movers) {
  const r1 = snapshots.find(
    (s) => s.playerExternalId === m.id && s.roundExternalId === "r:1",
  );
  if (!r1) continue;
  snapshots.push({
    playerExternalId: m.id,
    roundExternalId: "r:2",
    priceSek: r1.priceSek + m.growth,
    growthSek: m.growth,
  });
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
