"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

export type Lead = { name: string; value: number };
export type ActiveLead = Lead & { pct: number };
type ChartRow = { label: string } & Record<string, number | string>;

export type SnackScope = {
  meta: {
    total: number;
    people: number;
    first: string | null;
    last: string | null;
    days: number;
    firstAuthor: string | null;
    busiestHour: number | null;
    busiestDay: string | null;
  };
  topPeople: string[];
  mostActive: ActiveLead[];
  quietest: Lead[];
  photos: Lead[];
  videos: Lead[];
  gifs: Lead[];
  stickers: Lead[];
  voice: Lead[];
  links: Lead[];
  emojis: Lead[];
  questions: Lead[];
  shouters: Lead[];
  laughs: Lead[];
  starters: Lead[];
  nightOwls: Lead[];
  wordiest: Lead[];
  longest: { name: string; chars: number; preview: string };
  timeline: { date: string; count: number }[];
  hourByPerson: ChartRow[];
  monthByPerson: ChartRow[];
  weekdayByPerson: ChartRow[];
  topWords: { word: string; value: number }[];
  topEmojis: { emoji: string; value: number }[];
};

export type SnackData = {
  generatedAt: string;
  allTime: SnackScope;
  copa26: SnackScope;
};

// Charts pull in Recharts — lazy + client-only so it's code-split to this page
// and never SSR'd (ResponsiveContainer needs a real DOM width). next/dynamic
// requires the options to be an inline object literal, hence the repetition.
function Skel({ h }: { h: number }) {
  return <div className="animate-pulse border border-border bg-border/10" style={{ height: h }} />;
}
const Timeline = dynamic(() => import("./charts").then((m) => m.Timeline), {
  ssr: false,
  loading: () => <Skel h={180} />,
});
const PersonDonut = dynamic(() => import("./charts").then((m) => m.PersonDonut), {
  ssr: false,
  loading: () => <Skel h={200} />,
});
const TimeOfDay = dynamic(() => import("./charts").then((m) => m.TimeOfDay), {
  ssr: false,
  loading: () => <Skel h={220} />,
});
const SeriesRadar = dynamic(() => import("./charts").then((m) => m.SeriesRadar), {
  ssr: false,
  loading: () => <Skel h={240} />,
});
const WordCloud = dynamic(() => import("./charts").then((m) => m.WordCloud), {
  ssr: false,
  loading: () => <Skel h={120} />,
});
const EmojiCloud = dynamic(() => import("./charts").then((m) => m.EmojiCloud), {
  ssr: false,
  loading: () => <Skel h={80} />,
});

const MINIS: { key: keyof SnackScope; title: string; unit?: string }[] = [
  { key: "photos", title: "BILDER" },
  { key: "gifs", title: "GIF" },
  { key: "videos", title: "VIDEOS" },
  { key: "links", title: "LÄNKAR" },
  { key: "emojis", title: "EMOJIS" },
  { key: "laughs", title: "SKRATTAR MEST", unit: "medd" },
  { key: "questions", title: "FRÅGVISAST", unit: "medd" },
  { key: "shouters", title: "SKRIKHALS", unit: "VERSALER" },
  { key: "wordiest", title: "ORDRIKAST", unit: "ord/medd" },
  { key: "starters", title: "STARTAR SNACKET" },
  { key: "nightOwls", title: "NATTUGGLOR", unit: "00–05" },
  { key: "stickers", title: "STICKERS" },
  { key: "voice", title: "RÖSTMEDD" },
];

export function SnackClient({ data }: { data: SnackData }) {
  const [scope, setScope] = useState<"allTime" | "copa26">("copa26");
  const s = data[scope];
  const max = s.mostActive[0]?.value ?? 1;

  return (
    <div className="space-y-10">
      {/* scope toggle */}
      <div className="flex gap-2">
        {(
          [
            ["copa26", "COPA 26"],
            ["allTime", "ALLA TIDER"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            className={`border px-4 py-2 text-xs font-bold uppercase tracking-widest transition ${
              scope === key
                ? "border-yellow bg-yellow text-black"
                : "border-border text-dim hover:border-cyan hover:text-cyan"
            }`}
          >
            [ {label} ]
          </button>
        ))}
      </div>

      {/* big stat cards */}
      <div className="grid grid-cols-2 border border-border">
        <StatCard
          label="CHATTAT I"
          value={s.meta.days.toLocaleString("sv-SE")}
          unit="dagar"
          tone="cyan"
        />
        <StatCard
          label="MEDDELANDEN"
          value={s.meta.total.toLocaleString("sv-SE")}
          unit={`${s.meta.people} personer`}
          tone="yellow"
          border
        />
      </div>
      <p className="-mt-6 text-[10px] uppercase tracking-widest text-dim">
        {s.meta.first} – {s.meta.last}
      </p>

      <Section title="TIDSLINJE" sub="meddelanden per dag">
        <Timeline data={s.timeline} xFormat={scope === "copa26" ? "month" : "year"} />
      </Section>

      {/* most active bars + donut */}
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <Section title="MEST AKTIVA">
          <ol className="space-y-1.5">
            {s.mostActive.map((r, i) => (
              <li key={r.name} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 text-[11px]">
                <span className="text-right tabular-nums text-dim">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{r.name}</span>
                  <span className="mt-0.5 block h-1 bg-cyan/70" style={{ width: `${(r.value / max) * 100}%` }} />
                </span>
                <span className="tabular-nums text-yellow">
                  {r.value.toLocaleString("sv-SE")}
                  <span className="ml-1 text-[9px] text-dim">{r.pct}%</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
        <Section title="FÖRDELNING">
          <PersonDonut mostActive={s.mostActive} total={s.meta.total} top={s.topPeople} />
        </Section>
      </div>

      <Section title="MEDDELANDEN PER TIMME" sub="per person, dygnet runt">
        <TimeOfDay data={s.hourByPerson} top={s.topPeople} />
      </Section>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <Section title="PER MÅNAD">
          <SeriesRadar data={s.monthByPerson} top={s.topPeople} />
        </Section>
        <Section title="PER VECKODAG">
          <SeriesRadar data={s.weekdayByPerson} top={s.topPeople} />
        </Section>
      </div>

      <Section title="ORDMOLN" sub="vanligaste orden">
        <WordCloud words={s.topWords} />
      </Section>

      <Section title="EMOJIS">
        <EmojiCloud emojis={s.topEmojis} />
      </Section>

      <MiniList title="TYSTAST" rows={s.quietest} accent="red" note="dök upp, men knappt" />

      <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
        {MINIS.map((m) => (
          <MiniList key={m.key} title={m.title} rows={s[m.key] as Lead[]} unit={m.unit} />
        ))}
      </div>

      <Section title="KURIOSA">
        <dl className="space-y-2 text-[11px]">
          <Fact k="MEST AKTIV TIMME">
            {s.meta.busiestHour !== null ? `kl ${String(s.meta.busiestHour).padStart(2, "0")}` : "—"}
          </Fact>
          <Fact k="MEST AKTIV DAG">{s.meta.busiestDay ?? "—"}</Fact>
          <Fact k="FÖRSTA MEDDELANDET">{s.meta.firstAuthor ?? "—"}</Fact>
          <div>
            <dt className="text-[9px] uppercase tracking-widest text-dim">
              LÄNGSTA MEDDELANDET · {s.longest.name} ·{" "}
              <span className="text-foreground tabular-nums">
                {s.longest.chars.toLocaleString("sv-SE")}
              </span>{" "}
              tecken
            </dt>
            <dd className="mt-1 border border-border bg-border/10 p-2 text-[11px] text-dim">
              {s.longest.preview}
              {s.longest.chars > s.longest.preview.length ? " …" : ""}
            </dd>
          </div>
        </dl>
      </Section>

      <p className="text-center text-[10px] uppercase tracking-widest text-dim">
        ──── UPPDATERAD {data.generatedAt} · COPA TEXT ────
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  tone,
  border,
}: {
  label: string;
  value: string;
  unit: string;
  tone: "cyan" | "yellow";
  border?: boolean;
}) {
  return (
    <div className={`p-4 ${border ? "border-l border-border" : ""}`}>
      <p className="text-[9px] uppercase tracking-widest text-dim">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone === "yellow" ? "text-yellow" : "text-cyan"}`}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-widest text-dim">{unit}</p>
    </div>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="border-b border-border pb-1 text-[10px] uppercase tracking-widest text-cyan">
        {title}
        {sub && <span className="ml-2 text-dim normal-case">· {sub}</span>}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function MiniList({
  title,
  rows,
  unit,
  accent = "cyan",
  note,
}: {
  title: string;
  rows: Lead[];
  unit?: string;
  accent?: "cyan" | "red";
  note?: string;
}) {
  return (
    <section>
      <h2
        className={`border-b border-border pb-1 text-[10px] uppercase tracking-widest ${
          accent === "red" ? "text-red" : "text-cyan"
        }`}
      >
        {title}
      </h2>
      {note && <p className="mt-1 text-[9px] uppercase tracking-widest text-dim">{note}</p>}
      {rows.length === 0 ? (
        <p className="mt-2 text-[11px] text-dim">— inga —</p>
      ) : (
        <ol className="mt-1.5 space-y-1">
          {rows.map((r, i) => (
            <li key={r.name} className="grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-2 text-[11px]">
              <span className="text-right tabular-nums text-dim">{i + 1}</span>
              <span className="truncate text-foreground">{r.name}</span>
              <span className="tabular-nums text-yellow">
                {r.value.toLocaleString("sv-SE")}
                {unit ? <span className="ml-1 text-[9px] text-dim">{unit}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[9px] uppercase tracking-widest text-dim">{k}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}
