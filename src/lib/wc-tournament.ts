/**
 * Live World Cup data — fetched directly from Aftonbladet's tournament
 * endpoints with a 60 s ISR cache so we don't hammer them but stay fresh
 * as matches go final. No DB tables; results, standings and bracket are
 * authoritative upstream.
 *
 * Endpoints (no auth):
 *   GET /tournaments/{tournamentId}                — meta + matchGroups
 *   GET /tournaments/{tournamentId}/standings      — pre-computed tables
 *   GET /games/{gameId}/rounds/{n}/matches         — fixtures per round
 *   GET /games/{gameId}/teams                      — team id → name/code
 */

const API_BASE = "https://api-manager.aftonbladet.se";
const GAME_ID = 735; // ab-2026-world-fantasy
const TOURNAMENT_ID = 504; // WC 2026
const ROUND_COUNT = 8;

const REVALIDATE_SEC = 60;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/${path}`, {
    next: { revalidate: REVALIDATE_SEC },
  });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// ─── Raw shapes from Aftonbladet ────────────────────────────────────────────

type RawTeam = {
  id: number;
  name: string;
  abbreviation?: string;
};

type RawMatchTeam = {
  type: "home" | "away";
  team: number;
};

type RawPeriod = {
  /** Aftonbladet uses different period types depending on stage; the most
   *  reliable signal is the periods array's last entry once the match is
   *  finished. Score fields may be `score` (object) or `homeScore`/`awayScore`. */
  type?: string;
  score?: { home: number; away: number };
  homeScore?: number;
  awayScore?: number;
};

type RawMatch = {
  id: number;
  start: string; // ISO
  name: string;
  status: "pending" | "ongoing" | "finished" | string;
  matchGroupId: number;
  periods: RawPeriod[];
  teams: RawMatchTeam[];
};

type RawMatchGroup = {
  id: number;
  name: string;
  isRanking?: boolean;
};

type RawTournament = {
  id: number;
  matchGroups: RawMatchGroup[];
};

type RawStandingsRow = {
  team: { id: number };
  rank: number;
  points: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
};

type RawStandingsGroup = {
  group: { id: number };
  standings: RawStandingsRow[];
};

// ─── Public shapes (after normalisation) ─────────────────────────────────────

export type WcTeam = {
  externalId: number;
  /** Three-letter code from Aftonbladet ("MEX", "ARG", …) — same code we
   *  use for jerseys + /landslag/[code] URLs. */
  code: string;
  name: string;
};

export type WcMatchGroup = {
  externalId: number;
  /** "Group A" / "Last 32" / "Final" / etc. — verbatim from Aftonbladet. */
  name: string;
  /** Letter (A–L) if the group is one of the 12 group-stage groups, else null. */
  letter: string | null;
  /** Bracket stage classifier used by the knockout page. */
  stage:
    | "group"
    | "r32"
    | "r16"
    | "qf"
    | "sf"
    | "final"
    | "bronze"
    | "other";
};

export type WcMatch = {
  externalId: number;
  kickoff: string; // ISO
  status: "pending" | "ongoing" | "finished" | string;
  matchGroupId: number;
  /** Fantasy-game round (1–8) the match belongs to. For the group stage
   *  this is also the WC matchday (1, 2, 3). For knockout it identifies
   *  the bracket round (R32, R16, QF, SF/Bronze, Final). */
  roundNumber: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
};

export type WcGroupStanding = {
  groupId: number;
  rows: {
    teamId: number;
    rank: number;
    points: number;
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDiff: number;
  }[];
};

// ─── Normalisation helpers ───────────────────────────────────────────────────

function classifyGroup(name: string): WcMatchGroup {
  const n = name.toLowerCase();
  let letter: string | null = null;
  let stage: WcMatchGroup["stage"] = "other";
  const groupMatch = name.match(/^Group ([A-Z])$/);
  if (groupMatch) {
    letter = groupMatch[1];
    stage = "group";
  } else if (n.includes("last 32") || n.includes("32")) stage = "r32";
  else if (n.includes("last 16") || n.includes("16")) stage = "r16";
  else if (n.includes("quarter")) stage = "qf";
  else if (n.includes("semi")) stage = "sf";
  else if (n.includes("final") && !n.includes("semi")) stage = "final";
  else if (n.includes("bronze") || n.includes("third")) stage = "bronze";
  return { externalId: 0, name, letter, stage };
}

function extractScore(periods: RawPeriod[]): { home: number; away: number } | null {
  if (!periods || periods.length === 0) return null;
  // Walk in reverse — the last populated period is the final score.
  for (let i = periods.length - 1; i >= 0; i--) {
    const p = periods[i];
    if (p.score && typeof p.score.home === "number") return { home: p.score.home, away: p.score.away };
    if (typeof p.homeScore === "number" && typeof p.awayScore === "number")
      return { home: p.homeScore, away: p.awayScore };
  }
  return null;
}

function normaliseMatch(m: RawMatch, roundNumber: number): WcMatch {
  const home = m.teams.find((t) => t.type === "home");
  const away = m.teams.find((t) => t.type === "away");
  const score = extractScore(m.periods);
  return {
    externalId: m.id,
    kickoff: m.start,
    status: m.status,
    matchGroupId: m.matchGroupId,
    roundNumber,
    homeTeamId: home?.team ?? 0,
    awayTeamId: away?.team ?? 0,
    homeScore: score?.home ?? null,
    awayScore: score?.away ?? null,
  };
}

// ─── Public fetchers ─────────────────────────────────────────────────────────

/**
 * Team id → { code, name } map. Aftonbladet returns abbreviations in the
 * /games/{id}/teams payload; that's the same 3-letter code we use for
 * jerseys and /landslag/[code] URLs.
 */
export async function getTeamLookup(): Promise<Map<number, WcTeam>> {
  const raw = await fetchJson<RawTeam[]>(`games/${GAME_ID}/teams`);
  const out = new Map<number, WcTeam>();
  for (const t of raw) {
    out.set(t.id, {
      externalId: t.id,
      code: (t.abbreviation ?? t.name).toUpperCase(),
      name: t.name,
    });
  }
  return out;
}

export async function getMatchGroups(): Promise<Map<number, WcMatchGroup>> {
  const raw = await fetchJson<RawTournament>(`tournaments/${TOURNAMENT_ID}`);
  const out = new Map<number, WcMatchGroup>();
  for (const mg of raw.matchGroups) {
    const c = classifyGroup(mg.name);
    out.set(mg.id, { ...c, externalId: mg.id });
  }
  return out;
}

export async function getAllMatches(): Promise<WcMatch[]> {
  const perRound = await Promise.all(
    Array.from({ length: ROUND_COUNT }, (_, i) =>
      fetchJson<RawMatch[]>(`games/${GAME_ID}/rounds/${i + 1}/matches`)
        .then((ms) => ({ round: i + 1, matches: ms }))
        .catch(() => ({ round: i + 1, matches: [] as RawMatch[] })),
    ),
  );
  return perRound.flatMap(({ round, matches }) =>
    matches.map((m) => normaliseMatch(m, round)),
  );
}

export async function getGroupStandings(): Promise<WcGroupStanding[]> {
  const raw = await fetchJson<RawStandingsGroup[]>(
    `tournaments/${TOURNAMENT_ID}/standings`,
  );
  return raw.map((g) => ({
    groupId: g.group.id,
    rows: g.standings.map((r) => ({
      teamId: r.team.id,
      rank: r.rank,
      points: r.points,
      matches: r.matches,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDiff: r.goalsFor - r.goalsAgainst,
    })),
  }));
}

// ─── Aggregated view used by pages ───────────────────────────────────────────

export type GroupView = {
  group: WcMatchGroup;
  standings: WcGroupStanding["rows"];
  matches: WcMatch[];
  /** Resolved team metadata for the rows + matches in this group. */
  teamsById: Map<number, WcTeam>;
};

export type KnockoutView = {
  stages: {
    stage: WcMatchGroup["stage"];
    label: string;
    matches: WcMatch[];
  }[];
  teamsById: Map<number, WcTeam>;
};

/** Build a per-group view (standings + fixtures) for every Group A–L. */
export async function getGroupsView(): Promise<GroupView[]> {
  const [teamsById, mgsById, matches, standings] = await Promise.all([
    getTeamLookup(),
    getMatchGroups(),
    getAllMatches(),
    getGroupStandings(),
  ]);
  const groups = [...mgsById.values()].filter((g) => g.stage === "group");
  groups.sort((a, b) => (a.letter ?? "").localeCompare(b.letter ?? ""));
  const standingsById = new Map(standings.map((s) => [s.groupId, s.rows]));
  const matchesByGroup = new Map<number, WcMatch[]>();
  for (const m of matches) {
    const arr = matchesByGroup.get(m.matchGroupId) ?? [];
    arr.push(m);
    matchesByGroup.set(m.matchGroupId, arr);
  }
  return groups.map((g) => ({
    group: g,
    standings: (standingsById.get(g.externalId) ?? []).slice().sort((a, b) => {
      // Defensive: prefer the API rank, fall back to points/GD/GF.
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.points !== b.points) return b.points - a.points;
      if (a.goalDiff !== b.goalDiff) return b.goalDiff - a.goalDiff;
      return b.goalsFor - a.goalsFor;
    }),
    matches: (matchesByGroup.get(g.externalId) ?? []).slice().sort((a, b) =>
      a.kickoff.localeCompare(b.kickoff),
    ),
    teamsById,
  }));
}

const STAGE_ORDER: WcMatchGroup["stage"][] = [
  "r32",
  "r16",
  "qf",
  "sf",
  "bronze",
  "final",
];
const STAGE_LABELS: Record<WcMatchGroup["stage"], string> = {
  group: "GRUPPSPEL",
  r32: "SEXTONDELSFINAL",
  r16: "ÅTTONDELSFINAL",
  qf: "KVARTSFINAL",
  sf: "SEMIFINAL",
  bronze: "BRONSMATCH",
  final: "FINAL",
  other: "ÖVRIGT",
};

export async function getKnockoutView(): Promise<KnockoutView> {
  const [teamsById, mgsById, matches] = await Promise.all([
    getTeamLookup(),
    getMatchGroups(),
    getAllMatches(),
  ]);
  const stages = STAGE_ORDER.map((stage) => {
    const groupIds = new Set(
      [...mgsById.values()].filter((g) => g.stage === stage).map((g) => g.externalId),
    );
    return {
      stage,
      label: STAGE_LABELS[stage],
      matches: matches
        .filter((m) => groupIds.has(m.matchGroupId))
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
    };
  });
  return { stages, teamsById };
}
