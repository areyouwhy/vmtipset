import type { LeaderboardRow } from "./leaderboard";

/**
 * Rivalry definitions for the /hets banter sub-pages. Pure config + pure
 * resolver — no DB access. Team names must match `teams.name` exactly; the
 * resolver attaches the live leaderboard row (or null if not found).
 *
 * Read-only: rivalries never affect game state. Voting (phase 2) will live in a
 * separate isolated table and is not wired here yet.
 */

export type RivalryAccent = "cyan" | "yellow" | "green" | "red" | "magenta";

export type RivalrySide = {
  key: string;
  /** ALL-CAPS camp label, e.g. "RAMOS". */
  label: string;
  accent: RivalryAccent;
  /** Exact `teams.name` values for this side (1 for a duel, N for a camp). */
  teamNames: string[];
  /** Optional external link (the statisticians' prediction sites). */
  link?: { href: string; label: string };
};

export type Rivalry = {
  slug: string;
  title: string;
  tagline: string;
  /** "duel" = 1v1 head-to-head; "team" = aggregated camp vs camp. */
  kind: "duel" | "team";
  /** Two camps for a duel/2-way; three for the Ramos-Riahi-Ejder triangel. */
  sides: RivalrySide[];
};

const MATCH_OFF: Rivalry = {
  slug: "match-off",
  title: "LLM vs Caco AI",
  tagline:
    "Två akademiker, två egenbyggda statistiska modeller, två hemmasnickrade sajter. Vem har byggt den smartaste modellen — eller bara den självsäkraste?",
  kind: "duel",
  sides: [
    {
      key: "lindmarker",
      label: "LARGE LINDMARKER MODEL",
      accent: "cyan",
      teamNames: ["Large Lindmarker Model"],
      link: { href: "https://jesperlindmarker.com/copa/", label: "SE MODELLEN" },
    },
    {
      key: "bizteka",
      label: "EL BIZTEKA",
      accent: "yellow",
      teamNames: ["Los Biztekas"],
      link: {
        href: "https://dashboard-rho-ten-40.vercel.app/",
        label: "SE DASHBOARDEN",
      },
    },
  ],
};

const RAMOS_VS_RIAHI: Rivalry = {
  slug: "ramos-vs-riahi",
  title: "RAMOS VS. RIAHI",
  tagline:
    "Tre mot tre. Lagkamp om äran. Summan av lagvärdet avgör vilken sida som får snacka bredast vid nästa middag.",
  kind: "team",
  sides: [
    {
      key: "ramos",
      label: "RAMOS",
      accent: "cyan",
      teamNames: ["LaFackingLife", "Babachurris Ball Boys", "Los Amigos Famosos"],
    },
    {
      key: "riahi",
      label: "RIAHI",
      accent: "yellow",
      teamNames: ["Kartagos örnar", "Strait from Hormuuz", "A10 FC"],
    },
  ],
};

const EJDER_VS_AI: Rivalry = {
  slug: "ejder-vs-ai",
  title: "EJDER VS. AI",
  tagline:
    "Människa mot maskin. Bröderna Ejder mot de två egenbyggda modellerna — Large Lindmarker Model och El Bizteka. Summan av lagvärdet avgör vem som får skryta.",
  kind: "team",
  sides: [
    {
      key: "ejder",
      label: "EJDER",
      accent: "green",
      teamNames: ["Don Pedros Gubbar", "Ilses Gubbar"],
    },
    {
      key: "ai",
      label: "AI",
      accent: "cyan",
      teamNames: ["Large Lindmarker Model", "Los Biztekas"],
    },
  ],
};

export const RIVALRIES: Rivalry[] = [
  MATCH_OFF,
  RAMOS_VS_RIAHI,
  EJDER_VS_AI,
];

export function getRivalry(slug: string): Rivalry | undefined {
  return RIVALRIES.find((r) => r.slug === slug);
}

/** Hub-list entries shown on /hets (includes the not-yet-built Diiif teaser). */
export const RIVALRY_LINKS: Array<{
  slug: string;
  title: string;
  blurb: string;
  accent: RivalryAccent;
  comingSoon?: boolean;
}> = [
  {
    slug: "match-off",
    title: "LLM vs Caco AI",
    blurb: "Lindmarker Model vs El Bizteka — modell mot modell.",
    accent: "cyan",
  },
  {
    slug: "ramos-vs-riahi",
    title: "RAMOS > riahi",
    blurb: "Tre mot tre. Lagvärdet avgör.",
    accent: "yellow",
  },
  {
    slug: "ejder-vs-ai",
    title: "Ejder vs AI",
    blurb: "Bröderna Ejder mot Lindmarker Model och El Bizteka. Människa mot maskin.",
    accent: "green",
  },
  {
    slug: "fades",
    title: "Diiifs fadäs",
    blurb: "Kommer snart. Diiif vet redan varför.",
    accent: "red",
    comingSoon: true,
  },
];

// ─── Pure resolver ──────────────────────────────────────────────────────────

export type ResolvedMember = {
  teamName: string;
  /** null if the name doesn't match any current team. */
  row: LeaderboardRow | null;
};

export type ResolvedSide = {
  key: string;
  label: string;
  accent: RivalryAccent;
  link?: { href: string; label: string };
  members: ResolvedMember[];
  /** Σ team value across resolved members (skips unresolved). null if none resolved. */
  totalTeamValueSek: number | null;
  /** Σ round growth across resolved members. null if none resolved. */
  totalGrowthSek: number | null;
};

export function resolveSide(
  side: RivalrySide,
  rowsByName: Map<string, LeaderboardRow>,
): ResolvedSide {
  const members: ResolvedMember[] = side.teamNames.map((name) => ({
    teamName: name,
    row: rowsByName.get(name) ?? null,
  }));
  const resolved = members.filter((m) => m.row !== null);
  const totalTeamValueSek = resolved.length
    ? resolved.reduce((acc, m) => acc + (m.row!.teamValueSek ?? 0), 0)
    : null;
  const totalGrowthSek = resolved.length
    ? resolved.reduce((acc, m) => acc + (m.row!.roundGrowthSek ?? 0), 0)
    : null;
  return {
    key: side.key,
    label: side.label,
    accent: side.accent,
    link: side.link,
    members,
    totalTeamValueSek,
    totalGrowthSek,
  };
}
