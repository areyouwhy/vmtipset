/**
 * Static catalog of pages for the ⌘K palette. Each entry has aliases /
 * keywords so users can find pages whether they type Swedish or English,
 * full names or abbreviations.
 *
 * `requires` gates the entry on the viewer's auth state:
 *   - undefined: anyone can see it
 *   - "signed-in": only signed-in users
 *   - "approved": signed-in + approved (i.e. has paid/been let in)
 *   - "admin": only the admin email
 */
export type PageEntry = {
  id: string;
  label: string;
  href: string;
  keywords: string[];
  requires?: "signed-in" | "approved" | "admin";
};

export const PAGE_ENTRIES: PageEntry[] = [
  {
    id: "home",
    label: "Hem",
    href: "/",
    keywords: ["start", "landing", "framsida", "hemma", "home"],
  },
  {
    id: "app",
    label: "Min sida",
    href: "/app",
    keywords: ["my page", "min app", "status", "dashboard", "min status"],
    requires: "signed-in",
  },
  {
    id: "app-squad",
    label: "Min trupp",
    href: "/app/squad",
    keywords: [
      "my squad",
      "min squad",
      "squad",
      "trupp",
      "spelarval",
      "byten",
      "transfers",
      "picker",
    ],
    requires: "approved",
  },
  {
    id: "tabell",
    label: "Tabell",
    href: "/tabell",
    keywords: ["ligatabell", "leaderboard", "standings", "ranking", "rank"],
  },
  {
    id: "spelare",
    label: "Spelare",
    href: "/spelare",
    keywords: ["players", "spelarlista", "stats", "statistik"],
  },
  {
    id: "klubblag",
    label: "Klubblag",
    href: "/klubblag",
    keywords: ["clubs", "klubbar", "domestic clubs"],
  },
  {
    id: "vm",
    label: "VM",
    href: "/vm",
    keywords: ["world cup", "tournament", "turnering"],
  },
  {
    id: "vm-gruppspel",
    label: "Gruppspel",
    href: "/vm/gruppspel",
    keywords: ["groups", "group stage", "grupper", "gruppen", "standings"],
  },
  {
    id: "vm-slutspel",
    label: "Slutspel",
    href: "/vm/slutspel",
    keywords: ["knockout", "bracket", "playoffs", "slut"],
  },
  {
    id: "hur",
    label: "Hur funkar det",
    href: "/hur",
    keywords: ["how", "rules", "regler", "scoring", "poäng", "system"],
  },
  {
    id: "hur-audit",
    label: "Audit",
    href: "/hur/audit",
    keywords: ["audit", "transparens", "rond audit", "scoring breakdown"],
  },
  {
    id: "admin",
    label: "Admin",
    href: "/admin",
    keywords: ["godkänn", "users", "approve"],
    requires: "admin",
  },
  {
    id: "admin-rounds",
    label: "Admin · Ronder",
    href: "/admin/rounds",
    keywords: ["lock", "score", "rond-livscykel", "öppna rond", "låsa"],
    requires: "admin",
  },
  {
    id: "admin-players",
    label: "Admin · Spelare",
    href: "/admin/players",
    keywords: ["override", "manual", "dropped"],
    requires: "admin",
  },
  {
    id: "admin-data",
    label: "Admin · Data",
    href: "/admin/data",
    keywords: ["ingest", "aftonbladet", "snapshots"],
    requires: "admin",
  },
  {
    id: "admin-config",
    label: "Admin · Pott / pris",
    href: "/admin/config",
    keywords: ["prize", "pott", "split", "places"],
    requires: "admin",
  },
  {
    id: "admin-bets",
    label: "Admin · Bet",
    href: "/admin/bets",
    keywords: ["dagens bet", "bets"],
    requires: "admin",
  },
  {
    id: "admin-side-bets",
    label: "Admin · Side bet",
    href: "/admin/side-bets",
    keywords: ["sidebet", "social bet"],
    requires: "admin",
  },
];

export const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
