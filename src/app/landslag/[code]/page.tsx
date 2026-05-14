import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Jersey, PitchJersey } from "@/lib/jersey";
import { getNationDetail, type NationPlayer } from "@/lib/nation-data";
import { fifaRank, FIFA_RANK_SOURCE_DATE } from "@/data/fifa-rank";
import { groupForCountry } from "@/data/wc-groups";

export const dynamic = "force-dynamic";

export default async function NationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const detail = await getNationDetail(code);
  if (!detail) notFound();

  const rank = fifaRank(detail.countryCode);
  const group = groupForCountry(detail.countryCode);
  const xi = detail.startingEleven;
  const captainId = xi.captainId;

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs
          trail={[
            { label: "VM", href: "/vm" },
            { label: "GRUPPSPEL", href: "/vm/gruppspel" },
            { label: detail.countryName.toUpperCase() },
          ]}
        />

        <section className="flex items-start gap-4 py-6">
          <Jersey code={detail.countryCode} size={88} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-dim">
              LANDSLAG · {detail.countryCode}
            </p>
            <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
              {detail.countryName}
            </h1>
            <p className="mt-2 flex flex-wrap items-baseline gap-4 text-[11px] uppercase tracking-widest">
              {group && (
                <span>
                  <span className="text-dim">GRUPP </span>
                  <Link
                    href={`/vm/gruppspel#grupp-${group}`}
                    className="text-cyan tabular-nums hover:text-yellow"
                  >
                    {group}
                  </Link>
                </span>
              )}
              <span>
                <span className="text-dim">FIFA-RANKING </span>
                <span className="text-yellow tabular-nums">
                  {rank === null ? "—" : `#${rank}`}
                </span>
                {rank !== null && (
                  <span className="ml-1 text-[9px] text-dim">
                    ({FIFA_RANK_SOURCE_DATE})
                  </span>
                )}
              </span>
              <span>
                <span className="text-dim">DREAM TEAM </span>
                <span className="text-green tabular-nums">
                  {detail.dreamTeamValueSek === null
                    ? "—"
                    : `${(detail.dreamTeamValueSek / 1_000_000).toFixed(1)}M`}
                </span>
              </span>
              <span>
                <span className="text-dim">TRUPP </span>
                <span className="text-cyan tabular-nums">
                  {detail.players.length}
                </span>
              </span>
            </p>
          </div>
        </section>

        <section className="border-t border-border pt-6">
          <h2 className="mb-2 text-[10px] uppercase tracking-widest text-dim">
            DREAM TEAM · DYRASTE STARTELVA
            {detail.dreamTeamFormation && (
              <>
                {" · "}
                <span className="text-yellow tabular-nums">
                  {detail.dreamTeamFormation.def}-
                  {detail.dreamTeamFormation.mid}-
                  {detail.dreamTeamFormation.fwd}
                </span>
              </>
            )}
          </h2>
          {detail.dreamTeamFormation ? (
            <Pitch
              countryCode={detail.countryCode}
              xi={xi}
              captainId={captainId}
            />
          ) : (
            <p className="border border-dashed border-border p-3 text-xs text-dim">
              — för få spelare för en laglig formation —
            </p>
          )}
        </section>

        <section className="mt-6 border-t border-border pt-6">
          <h2 className="mb-2 text-[10px] uppercase tracking-widest text-dim">
            HELA TRUPPEN
          </h2>
          <RosterByPosition players={detail.players} />
        </section>
      </div>
    </main>
  );
}

function Pitch({
  countryCode,
  xi,
  captainId,
}: {
  countryCode: string;
  xi: {
    GK: NationPlayer[];
    DEF: NationPlayer[];
    MID: NationPlayer[];
    FWD: NationPlayer[];
  };
  captainId: string | null;
}) {
  // Same vertical orientation as the fantasy picker pitch.
  return (
    <div
      className="relative w-full overflow-hidden border border-border bg-[#0e2916]"
      style={{ aspectRatio: "3 / 4" }}
    >
      <div className="absolute inset-0 flex flex-col justify-around p-3">
        <Row players={xi.GK} countryCode={countryCode} captainId={captainId} />
        <Row players={xi.DEF} countryCode={countryCode} captainId={captainId} />
        <Row players={xi.MID} countryCode={countryCode} captainId={captainId} />
        <Row players={xi.FWD} countryCode={countryCode} captainId={captainId} />
      </div>
    </div>
  );
}

function Row({
  players,
  countryCode,
  captainId,
}: {
  players: NationPlayer[];
  countryCode: string;
  captainId: string | null;
}) {
  return (
    <div className="flex items-end justify-around gap-2">
      {players.map((p) => (
        <Chip key={p.id} player={p} countryCode={countryCode} isCaptain={p.id === captainId} />
      ))}
    </div>
  );
}

function Chip({
  player,
  countryCode,
  isCaptain,
}: {
  player: NationPlayer;
  countryCode: string;
  isCaptain: boolean;
}) {
  const lastName = player.name.split(" ").slice(-1)[0] ?? player.name;
  return (
    <Link
      href={`/spelare/${player.id}`}
      className="flex min-w-0 flex-1 flex-col items-center transition hover:opacity-80"
      title={player.name}
    >
      <div className="relative">
        <PitchJersey
          countryCode={countryCode}
          size={84}
          ringClass={isCaptain ? "ring-2 ring-yellow" : ""}
        />
        {isCaptain && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center border border-yellow bg-yellow text-[9px] font-bold leading-none text-black">
            C
          </span>
        )}
      </div>
      <span className="mt-1 line-clamp-1 max-w-[100px] bg-black/80 px-1 text-[10px] leading-tight text-foreground">
        {lastName}
      </span>
      <span className="line-clamp-1 max-w-[100px] bg-black/80 px-1 text-[9px] tabular-nums text-yellow">
        {player.priceSek === null
          ? "—"
          : `${(player.priceSek / 1_000_000).toFixed(1)}M`}
      </span>
    </Link>
  );
}

function RosterByPosition({ players }: { players: NationPlayer[] }) {
  const groups: Array<{ label: string; pos: NationPlayer["position"] }> = [
    { label: "MÅLVAKT", pos: "GK" },
    { label: "FÖRSVAR", pos: "DEF" },
    { label: "MITTFÄLT", pos: "MID" },
    { label: "ANFALL", pos: "FWD" },
  ];
  return (
    <div className="space-y-4">
      {groups.map(({ label, pos }) => {
        const inGroup = players.filter((p) => p.position === pos);
        if (inGroup.length === 0) return null;
        return (
          <div key={pos}>
            <h3 className="mb-1 text-[10px] uppercase tracking-widest text-dim">
              {label} <span className="text-cyan">{inGroup.length}</span>
            </h3>
            <ul className="divide-y divide-border border border-border">
              {inGroup.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/spelare/${p.id}`}
                    className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 p-2 text-sm transition hover:bg-yellow/5"
                  >
                    <span className="text-yellow tabular-nums">{p.position}</span>
                    <span className="truncate text-foreground">{p.name}</span>
                    <span className="tabular-nums text-foreground">
                      {p.priceSek === null
                        ? "—"
                        : `${(p.priceSek / 1_000_000).toFixed(1)}M`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
