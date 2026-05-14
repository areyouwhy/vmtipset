import type { Position } from "@/db/schema";

/**
 * Shape of data coming from any external source — either Aftonbladet's API or
 * a hand-crafted dataset for tests/local dev. Sources speak in `externalId`s;
 * the ingest layer maps them to our internal UUIDs.
 */

export type ExternalClub = {
  externalId: string;
  name: string;
  shortName?: string | null;
  countryCode?: string | null;
};

export type ExternalPlayer = {
  externalId: string;
  name: string;
  clubExternalId: string;
  position: Position;
  active?: boolean;
  /** Hex colour for the stylised avatar head. */
  skinColor?: string | null;
  /** Hex colour for the stylised avatar hair cap. */
  hairColor?: string | null;
};

export type ExternalRound = {
  externalId: string;
  number: number;
  name: string;
  deadline?: string | null; // ISO 8601
};

export type ExternalSnapshot = {
  playerExternalId: string;
  roundExternalId: string;
  priceSek: number;
  growthSek: number;
  /** Cumulative growth across the tournament through this round. */
  totalGrowthSek?: number;
  /** Raw count of teams owning this player at snapshot time. */
  popularity?: number;
  /** -1 = falling, 0 = flat, +1 = rising. */
  trend?: number;
};

export type ExternalDataset = {
  clubs: ExternalClub[];
  players: ExternalPlayer[];
  rounds: ExternalRound[];
  snapshots: ExternalSnapshot[];
};

export interface DataSource {
  readonly id: string;
  fetchAll(): Promise<ExternalDataset>;
}
