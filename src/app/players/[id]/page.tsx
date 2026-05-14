import Link from "next/link";
import { notFound } from "next/navigation";
import { Jersey } from "@/lib/jersey";
import { getPlayerDetail } from "@/lib/players-data";

export const dynamic = "force-dynamic";

export default async function PublicPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPlayerDetail(id);
  if (!detail) notFound();

  const { player, club, rounds: roundLines } = detail;
  const countryCode = club?.countryCode ?? null;

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / SPELARE</span>
          <Link href="/players" className="text-cyan">
            ← ALLA SPELARE
          </Link>
        </header>

        <section className="flex items-start gap-4 py-6">
          {countryCode ? (
            <Link href={`/landslag/${countryCode}`} className="shrink-0">
              <Jersey code={countryCode} size={72} />
            </Link>
          ) : null}
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-dim">
              {player.position} · {club?.shortName ?? club?.name ?? "—"}
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
              {player.name}
            </h1>
            {countryCode && (
              <p className="mt-1 text-xs uppercase tracking-widest text-dim">
                <Link
                  href={`/landslag/${countryCode}`}
                  className="text-cyan hover:underline"
                >
                  {countryCode} ↗
                </Link>
              </p>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-[10px] uppercase tracking-widest text-dim">
            RONDVÄRDEN
          </h2>
          {roundLines.length === 0 && (
            <p className="text-sm text-dim">— inga ronder ännu —</p>
          )}
          {roundLines.map((line) => {
            const effective = line.manual ?? line.api;
            return (
              <article
                key={line.roundId}
                className="border border-border p-3"
              >
                <header className="flex items-baseline justify-between gap-3 text-xs uppercase tracking-widest">
                  <span>
                    <span className="text-dim">ROND </span>
                    <span className="text-yellow tabular-nums">
                      {String(line.roundNumber).padStart(2, "0")}
                    </span>
                    <span className="text-foreground"> — {line.roundName}</span>
                  </span>
                  <span
                    className={
                      line.manual
                        ? "text-yellow"
                        : line.api
                          ? "text-cyan"
                          : "text-dim"
                    }
                  >
                    {line.manual ? "JUSTERAD" : line.api ? "API" : "—"}
                  </span>
                </header>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                  <KV
                    k="PRIS"
                    v={
                      effective
                        ? `${(effective.priceSek / 1_000_000).toFixed(2)}M`
                        : "—"
                    }
                  />
                  <KV
                    k="TILLVÄXT"
                    v={effective ? fmtSek(effective.growthSek) : "—"}
                    tone={
                      effective && effective.growthSek > 0
                        ? "green"
                        : effective && effective.growthSek < 0
                          ? "red"
                          : undefined
                    }
                  />
                </dl>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function KV({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "green" | "red";
}) {
  const c =
    tone === "green"
      ? "text-green"
      : tone === "red"
        ? "text-red"
        : "text-foreground";
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-dim">{k}</dt>
      <dd className={c}>{v}</dd>
    </div>
  );
}

function fmtSek(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}
