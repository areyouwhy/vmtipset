import type { Position } from "@/db/schema";
import type {
  DataSource,
  ExternalClub,
  ExternalDataset,
  ExternalPlayer,
  ExternalRound,
  ExternalSnapshot,
} from "./types";

/**
 * Real Aftonbladet Manager API client.
 *
 * Endpoints (no auth required):
 *   GET /games/{gameId}                                — game meta incl. rounds[] and ruleset.id
 *   GET /games/{gameId}/players?limit=1000             — every player in the competition
 *   GET /games/{gameId}/rounds/{n}/players             — bulk values per round
 *   GET /persons/{id}                                  — person.fullName lookup
 *   GET /teams/{id}                                    — team.name + abbreviation + country
 *   GET /rulesets/{id}                                 — formation/position rules
 *
 * Configurable via env:
 *   AFTONBLADET_API_BASE  default https://api-manager.aftonbladet.se
 *   AFTONBLADET_GAME_ID   default 735  (WC 2026 — slug ab-2026-world-fantasy, ruleset 197)
 */

const DEFAULT_API_BASE = "https://api-manager.aftonbladet.se";
const DEFAULT_GAME_ID = "735";

const PLAYER_BATCH = 80;

/** Stable position slugs from the ruleset → our enum. Same slugs across PL/WC. */
const POSITION_BY_SLUG: Record<string, Position> = {
  goalkeeper: "GK",
  defense: "DEF",
  midfield: "MID",
  striker: "FWD",
};

type RawGame = {
  ruleset?: { id: number };
  rounds?: { start?: string; end?: string; close?: string }[];
};

type RawRuleset = {
  positions?: { id: number; slug: string; name: string }[];
  /** RAW event taxonomy — these are the IDs that appear in
   *  /statistics events.round[].type.id. (Goal, Lineup, Benched, etc.) */
  eventTypes?: {
    id: number;
    name: string;
    title: string;
    abbreviation?: string;
    imageUrl?: string;
  }[];
  /** Aftonbladet's fantasy scoring catalog — separate ID space from
   *  eventTypes. e.g., a Goal event becomes SoccerDefenseGoal/MidfieldGoal/
   *  StrikerGoal depending on the player's position. Surfaced on /hur for
   *  reference only; we don't auto-bridge. */
  fantasyEventTypes?: {
    id: number;
    name: string;
    title: string;
    shortTitle?: string;
    value: number;
    imageUrl?: string;
  }[];
};

type RawStatistics = {
  player: number | { id: number };
  values: {
    growth: number;
    totalGrowth?: number;
    value: number;
    popularity?: number;
    trend?: number;
  };
  events?: {
    round?: Array<{ type: { id: number }; amount: number }>;
    total?: Array<{ type: { id: number }; amount: number }>;
  };
};

type RawPlayer = {
  id: number;
  person: { id: number };
  team: { id: number };
  position: { id: number };
  active?: boolean;
  eliminated?: boolean;
};

type RawTeam = {
  id: number;
  name: string;
  abbreviation?: string;
  country?: { code?: string; name?: string };
};

type RawPerson = {
  id: number;
  fullName: string;
  nationality?: { code?: string };
};


async function getJson<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${label} → ${res.status} ${res.statusText} (${url})`);
  }
  return (await res.json()) as T;
}

async function tryGetJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const aftonbladetSource: DataSource = {
  id: "aftonbladet",
  async fetchAll(): Promise<ExternalDataset> {
    const apiBase = process.env.AFTONBLADET_API_BASE ?? DEFAULT_API_BASE;
    const gameId = process.env.AFTONBLADET_GAME_ID ?? DEFAULT_GAME_ID;

    // 1. Game meta — rounds + ruleset id.
    const game = await getJson<RawGame>(
      `${apiBase}/games/${gameId}`,
      "game",
    );
    const rawRounds = game.rounds ?? [];
    const rounds: ExternalRound[] = rawRounds.map((r, i) => {
      // `close` is the squad-lock deadline. Falls back to `start` if absent.
      // Normalize to canonical ISO (with ms) so it matches what we read back
      // from Postgres via `Date.toISOString()` — otherwise change-detection
      // fires every cron tick on identical instants.
      const raw = r.close ?? r.start ?? null;
      const deadline = raw ? new Date(raw).toISOString() : null;
      return {
        externalId: `ab:r:${i + 1}`,
        number: i + 1,
        name: `Round ${i + 1}`,
        deadline,
      };
    });

    // 2. Ruleset — position mapping + the two event catalogs.
    let positionByApiId: Record<number, Position> = {};
    let eventTypes: NonNullable<ExternalDataset["eventTypes"]> = [];
    let fantasyEventTypes: NonNullable<ExternalDataset["fantasyEventTypes"]> = [];
    if (game.ruleset?.id) {
      const ruleset = await tryGetJson<RawRuleset>(
        `${apiBase}/rulesets/${game.ruleset.id}`,
      );
      for (const p of ruleset?.positions ?? []) {
        const mapped = POSITION_BY_SLUG[p.slug];
        if (mapped) positionByApiId[p.id] = mapped;
      }
      eventTypes = (ruleset?.eventTypes ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        title: t.title,
        abbreviation: t.abbreviation ?? null,
        imageUrl: t.imageUrl ?? null,
      }));
      fantasyEventTypes = (ruleset?.fantasyEventTypes ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        title: t.title,
        shortTitle: t.shortTitle ?? null,
        valueSek: t.value,
        imageUrl: t.imageUrl ?? null,
      }));
    }
    if (Object.keys(positionByApiId).length === 0) {
      // Fallback to PL ruleset 193 ids if ruleset fetch failed.
      positionByApiId = { 6: "GK", 7: "DEF", 8: "MID", 9: "FWD" };
    }

    // 3. All players in the game (filter out inactive/eliminated).
    const allRawPlayers = await getJson<RawPlayer[]>(
      `${apiBase}/games/${gameId}/players?limit=1000`,
      "players",
    );
    const rawPlayers = allRawPlayers.filter(
      (p) => p.active !== false && p.eliminated !== true,
    );

    // 4. Unique teams in parallel.
    const teamIds = Array.from(new Set(rawPlayers.map((p) => p.team.id)));
    const teamById = new Map<number, RawTeam>();
    await Promise.all(
      teamIds.map(async (tid) => {
        const data = await tryGetJson<RawTeam>(`${apiBase}/teams/${tid}`);
        if (data) teamById.set(tid, data);
      }),
    );

    // 5. Unique persons (name lookup), batched.
    const personIds = Array.from(new Set(rawPlayers.map((p) => p.person.id)));
    const personById = new Map<number, RawPerson>();
    for (let i = 0; i < personIds.length; i += PLAYER_BATCH) {
      const batch = personIds.slice(i, i + PLAYER_BATCH);
      await Promise.all(
        batch.map(async (pid) => {
          const data = await tryGetJson<RawPerson>(
            `${apiBase}/persons/${pid}`,
          );
          if (data) personById.set(pid, data);
        }),
      );
    }

    // 6. Snapshots for each round, with events.
    // `/rounds/{n}/statistics` returns the same fields as `/rounds/{n}/players`
    // PLUS per-player events ({typeId, amount}). Same shape change otherwise.
    const snapshots: ExternalSnapshot[] = [];
    for (const round of rounds) {
      const stats = await tryGetJson<RawStatistics[]>(
        `${apiBase}/games/${gameId}/rounds/${round.number}/statistics`,
      );
      if (!stats) continue;
      for (const rv of stats) {
        const playerId =
          typeof rv.player === "number" ? rv.player : rv.player.id;
        const rawTrend = rv.values.trend ?? 0;
        const trend = rawTrend > 0 ? 1 : rawTrend < 0 ? -1 : 0;
        const events = (rv.events?.round ?? []).map((e) => ({
          typeId: e.type.id,
          amount: e.amount,
        }));
        snapshots.push({
          playerExternalId: `ab:p:${playerId}`,
          roundExternalId: round.externalId,
          priceSek: rv.values.value ?? 0,
          growthSek: rv.values.growth ?? 0,
          totalGrowthSek: rv.values.totalGrowth ?? 0,
          popularity: rv.values.popularity ?? 0,
          trend,
          events,
        });
      }
    }

    // Build the typed dataset.
    // For WC the "team" IS a nation — there's no nested country object, but
    // `abbreviation` is the ISO alpha-3 code (ARG, BRA…). Fall back to it so
    // the squad picker's LAND filter works on national-team data.
    const clubs: ExternalClub[] = Array.from(teamById.values()).map((t) => ({
      externalId: `ab:club:${t.id}`,
      name: t.name,
      shortName: t.abbreviation ?? null,
      countryCode: t.country?.code ?? t.abbreviation ?? null,
    }));

    const players: ExternalPlayer[] = rawPlayers.flatMap((p) => {
      const position = positionByApiId[p.position.id];
      if (!position) return [];
      const person = personById.get(p.person.id);
      return [
        {
          externalId: `ab:p:${p.id}`,
          name: person?.fullName ?? "—",
          clubExternalId: `ab:club:${p.team.id}`,
          position,
        },
      ];
    });

    return { clubs, players, rounds, snapshots, eventTypes, fantasyEventTypes };
  },
};
