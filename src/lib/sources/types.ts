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
};

export type ExternalRound = {
  externalId: string;
  number: number;
  name: string;
  deadline?: string | null; // ISO 8601
};

export type ExternalEvent = {
  /** Source-specific event type id (Aftonbladet's fantasyEventTypes.id). */
  typeId: number;
  /** How many times this event happened in the round (usually 1, can be 2+ for goals etc). */
  amount: number;
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
  /** Scoring events for THIS round (empty if no match has played yet). */
  events?: ExternalEvent[];
};

export type ExternalEventType = {
  /** Raw event-type id from the source. References match snapshot.events[].typeId. */
  id: number;
  name: string;
  title: string;
  abbreviation?: string | null;
  imageUrl?: string | null;
};

export type ExternalFantasyEventType = {
  id: number;
  name: string;
  title: string;
  shortTitle?: string | null;
  valueSek: number;
  imageUrl?: string | null;
};

export type ExternalDataset = {
  clubs: ExternalClub[];
  players: ExternalPlayer[];
  rounds: ExternalRound[];
  snapshots: ExternalSnapshot[];
  /** Raw event taxonomy from the source's ruleset. Used to resolve names
   *  for events stored on snapshots. */
  eventTypes?: ExternalEventType[];
  /** Fantasy-scoring catalog with SEK values. Surfaced on /hur as the
   *  canonical scoring rules. */
  fantasyEventTypes?: ExternalFantasyEventType[];
};

export interface DataSource {
  readonly id: string;
  fetchAll(): Promise<ExternalDataset>;
}
