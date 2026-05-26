import { asc, eq, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import {
  clubs,
  playerRoundSnapshots,
  players,
  rounds,
  type Player,
} from "@/db/schema";

/**
 * Minimal projection of a snapshot row — just what the price-map builders
 * need. Skips the `events` jsonb column (biggest field per row) and other
 * unused metadata, so an unfiltered table dump goes from a few MB to a
 * few hundred KB.
 */
type SnapshotPriceRow = {
  playerId: string;
  roundId: string;
  priceSek: number;
  source: "api" | "manual";
};
import { currentRules } from "@/lib/rules";
import {
  getAllMatches,
  getTeamLookup,
  type WcMatch,
  type WcTeam,
} from "@/lib/wc-tournament";

export type NationPlayer = {
  id: string;
  /** Aftonbladet external id, e.g. "ab:p:248321" — used for club lookup. */
  externalId: string | null;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  /** Most recent snapshot price; falls back to baseline; null if none. */
  priceSek: number | null;
  basePriceSek: number | null;
};

export type StartingEleven = {
  GK: NationPlayer[];
  DEF: NationPlayer[];
  MID: NationPlayer[];
  FWD: NationPlayer[];
  captainId: string | null;
};


export type NationDetail = {
  countryCode: string;
  countryName: string;
  /** All active players from this country, sorted by position then price. */
  players: NationPlayer[];
  /** "Best XI" under the most expensive legal formation. Captain = most
   *  expensive FWD (or most expensive overall if no FWD picked). */
  startingEleven: StartingEleven;
  /** The formation actually chosen (def-mid-fwd). null when the roster
   *  can't fill any legal shape. */
  dreamTeamFormation: { def: number; mid: number; fwd: number } | null;
  /** Sum of priceSek across the 11 best-XI players. null if no valid XI
   *  could be built (roster too short or prices missing). */
  dreamTeamValueSek: number | null;
  /** WC matches involving this team, ordered by kickoff. Populated from
   *  the WC tournament feed (separate id space from our clubs table —
   *  matched by ISO country code). Empty if no matches found. */
  matches: WcMatch[];
  /** Team id → team metadata for resolving the opponent's name + jersey. */
  wcTeamsById: Map<number, WcTeam>;
};

function priceOf(p: NationPlayer): number {
  return p.priceSek ?? p.basePriceSek ?? -Infinity;
}

/**
 * Pick the highest-value legal starting XI for this roster. Tries every
 * formation allowed by the rules (4-3-3, 4-4-2, 3-5-2, etc.) and keeps
 * the one whose top-N picks per position sum to the most. Pure function —
 * no IO. Returns null formation/value when no legal shape fits.
 */
function buildDreamTeam(roster: NationPlayer[]): {
  startingEleven: StartingEleven;
  dreamTeamFormation: { def: number; mid: number; fwd: number } | null;
  dreamTeamValueSek: number | null;
} {
  const byPos = {
    GK: roster.filter((p) => p.position === "GK"),
    DEF: roster.filter((p) => p.position === "DEF"),
    MID: roster.filter((p) => p.position === "MID"),
    FWD: roster.filter((p) => p.position === "FWD"),
  };
  for (const k of Object.keys(byPos) as (keyof typeof byPos)[]) {
    byPos[k].sort((a, b) => priceOf(b) - priceOf(a));
  }

  // No goalkeeper at all → no legal XI.
  if (byPos.GK.length === 0) {
    return {
      startingEleven: {
        GK: [], DEF: [], MID: [], FWD: [], captainId: null,
      },
      dreamTeamFormation: null,
      dreamTeamValueSek: null,
    };
  }

  let best: {
    formation: { def: number; mid: number; fwd: number };
    xi: NationPlayer[];
    value: number;
    eleven: StartingEleven;
  } | null = null;

  for (const f of currentRules.legalFormations) {
    if (
      byPos.DEF.length < f.def ||
      byPos.MID.length < f.mid ||
      byPos.FWD.length < f.fwd
    ) {
      continue;
    }
    const gk = byPos.GK.slice(0, 1);
    const def = byPos.DEF.slice(0, f.def);
    const mid = byPos.MID.slice(0, f.mid);
    const fwd = byPos.FWD.slice(0, f.fwd);
    const xi = [...gk, ...def, ...mid, ...fwd];
    const anyMissing = xi.some(
      (p) => p.priceSek === null && p.basePriceSek === null,
    );
    if (anyMissing) continue;
    const value = xi.reduce(
      (acc, p) => acc + (p.priceSek ?? p.basePriceSek ?? 0),
      0,
    );
    const eleven: StartingEleven = {
      GK: gk,
      DEF: def,
      MID: mid,
      FWD: fwd,
      captainId:
        fwd[0]?.id ??
        [...mid, ...def, ...gk].sort((a, b) => priceOf(b) - priceOf(a))[0]?.id ??
        null,
    };
    if (!best || value > best.value) {
      best = { formation: f, xi, value, eleven };
    }
  }

  if (!best) {
    return {
      startingEleven: {
        GK: byPos.GK.slice(0, 1),
        DEF: byPos.DEF.slice(0, 4),
        MID: byPos.MID.slice(0, 3),
        FWD: byPos.FWD.slice(0, 3),
        captainId: null,
      },
      dreamTeamFormation: null,
      dreamTeamValueSek: null,
    };
  }
  return {
    startingEleven: best.eleven,
    dreamTeamFormation: best.formation,
    dreamTeamValueSek: best.value,
  };
}

/**
 * Build the latest-priority price map for a set of players. Manual wins over
 * API for the same (round, player); the most recent round wins overall.
 */
function buildPriceMaps(
  allSnapshots: SnapshotPriceRow[],
  baseRoundId: string | undefined,
  latestRoundId: string | undefined,
  playerIds: Set<string>,
): {
  baseline: Map<string, number>;
  latest: Map<string, number>;
} {
  const baseline = new Map<string, number>();
  const latest = new Map<string, number>();
  const baselineSrc = new Map<string, "api" | "manual">();
  const latestSrc = new Map<string, "api" | "manual">();
  for (const s of allSnapshots) {
    if (!playerIds.has(s.playerId)) continue;
    if (s.roundId === baseRoundId) {
      const prev = baselineSrc.get(s.playerId);
      if (!prev || (prev === "api" && s.source === "manual")) {
        baseline.set(s.playerId, s.priceSek);
        baselineSrc.set(s.playerId, s.source);
      }
    }
    if (s.roundId === latestRoundId) {
      const prev = latestSrc.get(s.playerId);
      if (!prev || (prev === "api" && s.source === "manual")) {
        latest.set(s.playerId, s.priceSek);
        latestSrc.set(s.playerId, s.source);
      }
    }
  }
  return { baseline, latest };
}

/**
 * Loads everything a /landslag/[code] page needs in one round-trip.
 * Returns null when no club/team with that ISO code exists.
 */
export const getNationDetail = unstable_cache(
  _getNationDetail,
  ["nation-detail"],
  { tags: ["players", "snapshots", "rounds", "clubs"], revalidate: 3600 },
);

async function _getNationDetail(
  countryCode: string,
): Promise<NationDetail | null> {
  const code = countryCode.toUpperCase();
  const [club] = await db
    .select()
    .from(clubs)
    .where(eq(clubs.countryCode, code))
    .limit(1);
  if (!club) return null;

  // Pull rounds first so we can filter the snapshot query to just the
  // two rounds we actually consume (base + latest). One extra RTT, much
  // less wire data.
  const allRounds = await db.select().from(rounds).orderBy(asc(rounds.number));
  const baseRoundId = allRounds[0]?.id;
  const latestRoundId = allRounds[allRounds.length - 1]?.id;
  const priceRoundIds = [
    ...new Set([baseRoundId, latestRoundId].filter((x): x is string => !!x)),
  ];

  const [allPlayers, allSnapshots, wcTeamsById, allMatches] = await Promise.all(
    [
      db
        .select()
        .from(players)
        .where(eq(players.clubId, club.id))
        .orderBy(asc(players.name)),
      priceRoundIds.length > 0
        ? db
            .select({
              playerId: playerRoundSnapshots.playerId,
              roundId: playerRoundSnapshots.roundId,
              priceSek: playerRoundSnapshots.priceSek,
              source: playerRoundSnapshots.source,
            })
            .from(playerRoundSnapshots)
            .where(inArray(playerRoundSnapshots.roundId, priceRoundIds))
        : Promise.resolve<SnapshotPriceRow[]>([]),
      getTeamLookup(),
      getAllMatches(),
    ],
  );

  // Match this nation to its WC team by ISO code. Fixtures we surface are
  // those where the team is either home or away.
  const wcTeam = [...wcTeamsById.values()].find((t) => t.code === code);
  const matches = wcTeam
    ? allMatches
        .filter(
          (m) =>
            m.homeTeamId === wcTeam.externalId ||
            m.awayTeamId === wcTeam.externalId,
        )
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    : [];

  const playerIds = new Set(allPlayers.map((p) => p.id));
  const { baseline, latest } = buildPriceMaps(
    allSnapshots,
    baseRoundId,
    latestRoundId,
    playerIds,
  );

  const roster: NationPlayer[] = allPlayers
    .filter((p: Player) => p.active)
    .map((p: Player) => ({
      id: p.id,
      externalId: p.externalId,
      name: p.name,
      position: p.position,
      priceSek: latest.get(p.id) ?? baseline.get(p.id) ?? null,
      basePriceSek: baseline.get(p.id) ?? null,
    }));

  const { startingEleven, dreamTeamFormation, dreamTeamValueSek } =
    buildDreamTeam(roster);

  // Full roster ordering: GK→FWD, then price desc.
  const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
  roster.sort((a, b) => {
    if (order[a.position] !== order[b.position]) {
      return order[a.position] - order[b.position];
    }
    return priceOf(b) - priceOf(a);
  });

  return {
    countryCode: code,
    countryName: club.name,
    players: roster,
    startingEleven,
    dreamTeamFormation,
    dreamTeamValueSek,
    matches,
    wcTeamsById,
  };
}

export type NationSummary = {
  countryCode: string;
  countryName: string;
  playerCount: number;
  /** Best-XI total value at current prices. null if not enough players or
   *  prices missing for the 11. */
  dreamTeamValueSek: number | null;
};

/**
 * Index-page support: every country we have a club row for, plus its best-XI
 * value. Single round-trip; reuses the same dream-team math as the detail
 * page so the two numbers always agree.
 */
export const getAllNations = unstable_cache(
  _getAllNations,
  ["all-nations"],
  { tags: ["players", "snapshots", "rounds", "clubs"], revalidate: 3600 },
);

async function _getAllNations(): Promise<NationSummary[]> {
  // Rounds first so we can filter snapshots to (base, latest) only.
  const allRounds = await db.select().from(rounds).orderBy(asc(rounds.number));
  const baseRoundId = allRounds[0]?.id;
  const latestRoundId = allRounds[allRounds.length - 1]?.id;
  const priceRoundIds = [
    ...new Set([baseRoundId, latestRoundId].filter((x): x is string => !!x)),
  ];

  const [allClubs, allPlayers, allSnapshots] = await Promise.all([
    db.select().from(clubs),
    db.select().from(players).where(eq(players.active, true)),
    priceRoundIds.length > 0
      ? db
          .select({
            playerId: playerRoundSnapshots.playerId,
            roundId: playerRoundSnapshots.roundId,
            priceSek: playerRoundSnapshots.priceSek,
            source: playerRoundSnapshots.source,
          })
          .from(playerRoundSnapshots)
          .where(inArray(playerRoundSnapshots.roundId, priceRoundIds))
      : Promise.resolve<SnapshotPriceRow[]>([]),
  ]);
  const allPlayerIds = new Set(allPlayers.map((p) => p.id));
  const { baseline, latest } = buildPriceMaps(
    allSnapshots,
    baseRoundId,
    latestRoundId,
    allPlayerIds,
  );

  // Bucket players by club id.
  const playersByClub = new Map<string, Player[]>();
  for (const p of allPlayers) {
    if (!p.clubId) continue;
    const arr = playersByClub.get(p.clubId) ?? [];
    arr.push(p);
    playersByClub.set(p.clubId, arr);
  }

  return allClubs
    .filter((c) => c.countryCode != null)
    .map((c) => {
      const roster: NationPlayer[] = (playersByClub.get(c.id) ?? []).map(
        (p) => ({
          id: p.id,
          externalId: p.externalId,
          name: p.name,
          position: p.position,
          priceSek: latest.get(p.id) ?? baseline.get(p.id) ?? null,
          basePriceSek: baseline.get(p.id) ?? null,
        }),
      );
      const { dreamTeamValueSek } = buildDreamTeam(roster);
      return {
        countryCode: c.countryCode!,
        countryName: c.name,
        playerCount: roster.length,
        dreamTeamValueSek,
      };
    });
}
