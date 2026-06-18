import type { H2HPlayer, H2HSquad, LeaderboardRow } from "@/lib/leaderboard";

/**
 * Presentational head-to-head comparison shared by the /hets Head-2-Head panel
 * and the rivalry pages. Pure render (no hooks, no client state) so it works in
 * both server and client components. Type-only import of leaderboard types, so
 * no server code leaks into the client bundle.
 */

export function MatchupBody({
  a,
  b,
  squadA,
  squadB,
  anyScored,
  aAccent = "text-cyan",
  bAccent = "text-yellow",
  verdictClass = "border-t border-magenta/40 text-magenta",
}: {
  a: LeaderboardRow;
  b: LeaderboardRow;
  squadA: H2HSquad | null;
  squadB: H2HSquad | null;
  anyScored: boolean;
  aAccent?: string;
  bAccent?: string;
  verdictClass?: string;
}) {
  return (
    <>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-[9px] uppercase tracking-widest text-dim">
          <tr className="border-b border-border">
            <th className="px-3 py-1.5 text-left">·</th>
            <th className={`px-3 py-1.5 text-right ${aAccent}`}>
              #{pad(a.rank)} {a.teamName}
            </th>
            <th className={`px-3 py-1.5 text-right ${bAccent}`}>
              #{pad(b.rank)} {b.teamName}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          <StatRow label="LAGVÄRDE" a={fmtNullSek(a.teamValueSek)} b={fmtNullSek(b.teamValueSek)} win={cmp(a.teamValueSek, b.teamValueSek)} />
          <StatRow label="SQUAD" a={fmtNullSek(a.squadValueSek)} b={fmtNullSek(b.squadValueSek)} win={cmp(a.squadValueSek, b.squadValueSek)} />
          <StatRow label="TILLVÄXT" a={fmtNullSek(a.roundGrowthSek)} b={fmtNullSek(b.roundGrowthSek)} win={cmp(a.roundGrowthSek, b.roundGrowthSek)} />
          <StatRow label="BANK" a={fmtNullSek(a.bankSek)} b={fmtNullSek(b.bankSek)} win={cmp(a.bankSek, b.bankSek)} />
          {anyScored ? (
            <StatRow label="Δ TOT" a={fmtSek(a.totalPointsSek)} b={fmtSek(b.totalPointsSek)} win={cmp(a.totalPointsSek, b.totalPointsSek)} />
          ) : (
            <PendingRow label="Δ TOT" />
          )}
          <StatRow label="PLACERING" a={`#${a.rank}`} b={`#${b.rank}`} win={cmp(-a.rank, -b.rank)} />
          {anyScored ? (
            <StatRow label="BÄSTA ROND" a={fmtNullSek(bestRound(a))} b={fmtNullSek(bestRound(b))} win={cmp(bestRound(a), bestRound(b))} />
          ) : (
            <PendingRow label="BÄSTA ROND" />
          )}
        </tbody>
      </table>
      <p className={`px-3 py-3 text-xs ${verdictClass}`}>{verdict(a, b)}</p>
      {squadA && squadB && (
        <SquadDuel aName={a.teamName} bName={b.teamName} squadA={squadA} squadB={squadB} />
      )}
    </>
  );
}

function StatRow({
  label,
  a,
  b,
  win,
}: {
  label: string;
  a: string;
  b: string;
  /** -1 = A wins, 1 = B wins, 0 = tie */
  win: number;
}) {
  // Negative values are always red (clarity wins over the green "ahead" tint).
  // The win-marker inherits the cell colour via currentColor.
  const cellClass = (value: string, wins: boolean) =>
    `px-3 py-1 text-right ${
      isNegative(value)
        ? "text-red font-bold"
        : wins
          ? "text-green font-bold"
          : "text-foreground"
    }`;
  return (
    <tr>
      <th className="px-3 py-1 text-left text-[10px] uppercase tracking-widest text-dim">
        {label}
      </th>
      <td className={cellClass(a, win < 0)}>
        {a}
        {win < 0 && <span className="ml-1">◂</span>}
      </td>
      <td className={cellClass(b, win > 0)}>
        {win > 0 && <span className="mr-1">▸</span>}
        {b}
      </td>
    </tr>
  );
}

/**
 * A stat that can't exist yet because no round has been scored. Spans both team
 * columns with a clear "not calculated" marker instead of a misleading 0.
 */
function PendingRow({ label }: { label: string }) {
  return (
    <tr>
      <th className="px-3 py-1 text-left text-[10px] uppercase tracking-widest text-dim">
        {label}
      </th>
      <td
        colSpan={2}
        className="px-3 py-1 text-right text-[10px] uppercase tracking-widest text-dim/70"
      >
        ⧗ EJ POÄNGSATT ÄNNU
      </td>
    </tr>
  );
}

// ─── Squad duel ─────────────────────────────────────────────────────────────

function SquadDuel({
  aName,
  bName,
  squadA,
  squadB,
}: {
  aName: string;
  bName: string;
  squadA: H2HSquad;
  squadB: H2HSquad;
}) {
  const capA = squadA.players.find((p) => p.isCaptain) ?? null;
  const capB = squadB.players.find((p) => p.isCaptain) ?? null;
  const starA = mostExpensive(squadA.players);
  const starB = mostExpensive(squadB.players);
  const bIds = new Set(squadB.players.map((p) => p.id));
  const shared = squadA.players.filter((p) => bIds.has(p.id));
  const sharedIds = new Set(shared.map((p) => p.id));

  return (
    <div className="border-t border-border">
      <p className="px-3 pt-3 text-[9px] uppercase tracking-widest text-dim">
        TRUPPJÄMFÖRELSE · ROND {squadA.roundNumber}
      </p>

      <table className="mt-1 w-full text-xs tabular-nums">
        <tbody className="divide-y divide-border/60">
          <StatRow
            label="KAPTEN"
            a={playerLabel(capA)}
            b={playerLabel(capB)}
            win={cmp(capA?.priceSek ?? null, capB?.priceSek ?? null)}
          />
          <StatRow
            label="DYRAST"
            a={playerLabel(starA)}
            b={playerLabel(starB)}
            win={cmp(starA?.priceSek ?? null, starB?.priceSek ?? null)}
          />
        </tbody>
      </table>

      <p className="border-t border-border px-3 py-2 text-xs">
        <span className="text-[9px] uppercase tracking-widest text-dim">
          GEMENSAMMA ·{" "}
        </span>
        {shared.length === 0 ? (
          <span className="text-green">Noll gemensamma spelare. Helt egna vägar.</span>
        ) : (
          <span className="text-yellow">
            {shared.length} st: {shared.map((p) => p.name).join(", ")}
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 gap-px border-t border-border bg-border">
        <RosterColumn title={aName} players={squadA.players} sharedIds={sharedIds} />
        <RosterColumn title={bName} players={squadB.players} sharedIds={sharedIds} />
      </div>
    </div>
  );
}

function RosterColumn({
  title,
  players,
  sharedIds,
}: {
  title: string;
  players: H2HPlayer[];
  sharedIds: Set<string>;
}) {
  return (
    <div className="bg-background px-3 py-2">
      <p className="truncate text-[10px] uppercase tracking-widest text-cyan">
        {title}
      </p>
      <ul className="mt-1 space-y-0.5">
        {players.map((p) => (
          <li
            key={p.id}
            className="flex items-baseline justify-between gap-2 text-[11px]"
          >
            <span
              className={`min-w-0 truncate ${
                sharedIds.has(p.id) ? "text-yellow" : "text-foreground"
              }`}
            >
              <span className="mr-1 inline-block w-7 text-dim">{p.position}</span>
              {p.name}
              {p.isCaptain && <span className="ml-1 text-magenta">(C)</span>}
            </span>
            <span className="shrink-0 tabular-nums text-dim">
              {p.priceSek === null ? "—" : fmtSek(p.priceSek)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── helpers (exported for reuse) ────────────────────────────────────────────

function mostExpensive(players: H2HPlayer[]): H2HPlayer | null {
  let best: H2HPlayer | null = null;
  for (const p of players) {
    if (p.priceSek === null) continue;
    if (best === null || p.priceSek > (best.priceSek ?? Number.NEGATIVE_INFINITY)) {
      best = p;
    }
  }
  return best;
}

function playerLabel(p: H2HPlayer | null): string {
  if (!p) return "—";
  return `${p.name} (${p.priceSek === null ? "—" : fmtSek(p.priceSek)})`;
}

function bestRound(row: LeaderboardRow): number | null {
  const vals = row.perRound
    .map((p) => p.pointsSek)
    .filter((v): v is number => v !== null);
  return vals.length ? Math.max(...vals) : null;
}

export function cmp(a: number | null, b: number | null): number {
  const av = a ?? Number.NEGATIVE_INFINITY;
  const bv = b ?? Number.NEGATIVE_INFINITY;
  if (av === bv) return 0;
  return av > bv ? -1 : 1;
}

function verdict(a: LeaderboardRow, b: LeaderboardRow): string {
  const av = a.teamValueSek ?? 0;
  const bv = b.teamValueSek ?? 0;
  if (av === bv) return "Dött lopp. Pinsamt jämnt — kom igen, någon måste vara bättre.";
  const leader = av > bv ? a : b;
  const loser = av > bv ? b : a;
  const diff = Math.abs(av - bv);
  return `${leader.teamName} leder med ${fmtSek(diff)}. ${loser.teamName} har en del att bevisa.`;
}

/** True for formatted numbers that start with a minus (fmtSek uses U+2212). */
export function isNegative(value: string): boolean {
  return value.startsWith("−") || value.startsWith("-");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function fmtNullSek(n: number | null): string {
  return n === null ? "—" : fmtSek(n);
}

export function fmtSek(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}
