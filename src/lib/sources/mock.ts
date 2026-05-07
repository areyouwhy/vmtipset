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
];

const players: ExternalPlayer[] = [
  // Liverpool
  { externalId: "p:liv-gk1", name: "Alisson", clubExternalId: "club:liv", position: "GK" },
  { externalId: "p:liv-def1", name: "Van Dijk", clubExternalId: "club:liv", position: "DEF" },
  { externalId: "p:liv-mid1", name: "MacAllister", clubExternalId: "club:liv", position: "MID" },
  { externalId: "p:liv-fwd1", name: "Salah", clubExternalId: "club:liv", position: "FWD" },
  // Arsenal
  { externalId: "p:ars-gk1", name: "Raya", clubExternalId: "club:ars", position: "GK" },
  { externalId: "p:ars-def1", name: "Saliba", clubExternalId: "club:ars", position: "DEF" },
  { externalId: "p:ars-mid1", name: "Ødegaard", clubExternalId: "club:ars", position: "MID" },
  { externalId: "p:ars-fwd1", name: "Saka", clubExternalId: "club:ars", position: "FWD" },
  // Man City
  { externalId: "p:mci-gk1", name: "Ederson", clubExternalId: "club:mci", position: "GK" },
  { externalId: "p:mci-def1", name: "Dias", clubExternalId: "club:mci", position: "DEF" },
  { externalId: "p:mci-mid1", name: "Rodri", clubExternalId: "club:mci", position: "MID" },
  { externalId: "p:mci-fwd1", name: "Haaland", clubExternalId: "club:mci", position: "FWD" },
];

const rounds: ExternalRound[] = [
  { externalId: "r:1", number: 1, name: "Round 1", deadline: "2026-06-12T19:00:00Z" },
  { externalId: "r:2", number: 2, name: "Round 2", deadline: "2026-06-19T19:00:00Z" },
];

// Round 1 — initial prices, growth = 0 (this is the baseline).
// Round 2 — small bumps for the "in-form" players.
const snapshots: ExternalSnapshot[] = [
  // Round 1 baseline
  { playerExternalId: "p:liv-gk1", roundExternalId: "r:1", priceSek: 5_000_000, growthSek: 0 },
  { playerExternalId: "p:liv-def1", roundExternalId: "r:1", priceSek: 6_500_000, growthSek: 0 },
  { playerExternalId: "p:liv-mid1", roundExternalId: "r:1", priceSek: 7_000_000, growthSek: 0 },
  { playerExternalId: "p:liv-fwd1", roundExternalId: "r:1", priceSek: 12_500_000, growthSek: 0 },
  { playerExternalId: "p:ars-gk1", roundExternalId: "r:1", priceSek: 4_500_000, growthSek: 0 },
  { playerExternalId: "p:ars-def1", roundExternalId: "r:1", priceSek: 6_000_000, growthSek: 0 },
  { playerExternalId: "p:ars-mid1", roundExternalId: "r:1", priceSek: 8_500_000, growthSek: 0 },
  { playerExternalId: "p:ars-fwd1", roundExternalId: "r:1", priceSek: 10_000_000, growthSek: 0 },
  { playerExternalId: "p:mci-gk1", roundExternalId: "r:1", priceSek: 5_500_000, growthSek: 0 },
  { playerExternalId: "p:mci-def1", roundExternalId: "r:1", priceSek: 6_500_000, growthSek: 0 },
  { playerExternalId: "p:mci-mid1", roundExternalId: "r:1", priceSek: 7_500_000, growthSek: 0 },
  { playerExternalId: "p:mci-fwd1", roundExternalId: "r:1", priceSek: 14_000_000, growthSek: 0 },
  // Round 2 — illustrative growth
  { playerExternalId: "p:liv-fwd1", roundExternalId: "r:2", priceSek: 12_700_000, growthSek: 200_000 },
  { playerExternalId: "p:ars-fwd1", roundExternalId: "r:2", priceSek: 9_900_000, growthSek: -100_000 },
  { playerExternalId: "p:mci-fwd1", roundExternalId: "r:2", priceSek: 14_300_000, growthSek: 300_000 },
];

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
