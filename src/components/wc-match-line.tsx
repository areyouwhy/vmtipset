import Link from "next/link";
import { Jersey } from "@/lib/jersey";
import type { WcMatch, WcTeam } from "@/lib/wc-tournament";

/**
 * Compact match row used in both the group expansion on /vm/gruppspel
 * and on the per-round /vm/omgang/[n] page.
 *
 *   date  HOME team [crest] [score] - [score] [crest] AWAY team
 */
export function WcMatchLine({
  m,
  teamsById,
}: {
  m: WcMatch;
  teamsById: Map<number, WcTeam>;
}) {
  const home = teamsById.get(m.homeTeamId);
  const away = teamsById.get(m.awayTeamId);
  const kickoff = new Date(m.kickoff);
  const date = kickoff.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
  const time = kickoff.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  const played = m.status === "finished" && m.homeScore !== null;
  const ongoing = m.status === "ongoing";
  return (
    <li className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 py-1.5 text-[11px]">
      <span className="text-[9px] uppercase tracking-widest text-dim">
        {date} {time}
      </span>
      <span className="flex items-center justify-end gap-1.5">
        {home && (
          <Link href={`/landslag/${home.code}`} className="truncate hover:text-yellow">
            {home.name}
          </Link>
        )}
        {home && <Jersey code={home.code} size={16} />}
      </span>
      <span
        className={`px-1 text-center tabular-nums ${
          ongoing ? "text-cyan" : "text-yellow"
        }`}
      >
        {played
          ? `${m.homeScore}-${m.awayScore}`
          : ongoing
            ? "LIVE"
            : "—"}
      </span>
      <span className="flex items-center gap-1.5">
        {away && <Jersey code={away.code} size={16} />}
        {away && (
          <Link href={`/landslag/${away.code}`} className="truncate hover:text-yellow">
            {away.name}
          </Link>
        )}
      </span>
      <span></span>
    </li>
  );
}
