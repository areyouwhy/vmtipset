"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Text-TV palette, one stable colour per charted person (by rank). "Övriga"
// is dim grey. Pure blue is unreadable on black, so we use a lifted blue.
const SERIES = [
  "#ffff00",
  "#00ffff",
  "#00ff00",
  "#ff0000",
  "#ff00ff",
  "#ff8800",
  "#ffffff",
  "#5a8dff",
];
const OTHERS = "Övriga";
const OTHERS_COLOR = "#888888";
const AXIS = "#888888";
const BORDER = "#2a2a2a";

function colorFor(name: string, top: string[]): string {
  if (name === OTHERS) return OTHERS_COLOR;
  const i = top.indexOf(name);
  return i >= 0 ? SERIES[i % SERIES.length] : OTHERS_COLOR;
}

type Row = { label: string } & Record<string, number | string>;

const TOOLTIP_STYLE = {
  background: "#000",
  border: `1px solid ${BORDER}`,
  fontSize: 11,
  fontFamily: "var(--font-geist-mono), monospace",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

function Legend({ names, top }: { names: string[]; top: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] uppercase tracking-widest text-dim">
      {names.map((n) => (
        <span key={n} className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2"
            style={{ background: colorFor(n, top) }}
          />
          {n}
        </span>
      ))}
    </div>
  );
}

const MONTHS_SV = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

// ─── Timeline (messages per active day) ──────────────────────────────────────
export function Timeline({
  data,
  xFormat = "year",
}: {
  data: { date: string; count: number }[];
  xFormat?: "year" | "month";
}) {
  // year → "2026"; month → "Jun" (the whole scope is one 2026 season).
  const fmtTick = (d: string) =>
    xFormat === "month" ? MONTHS_SV[+d.slice(5, 7) - 1] : d.slice(0, 4);
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="snackArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00ffff" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#00ffff" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: AXIS, fontSize: 9 }}
          tickFormatter={fmtTick}
          minTickGap={40}
          axisLine={{ stroke: BORDER }}
          tickLine={false}
        />
        <YAxis tick={{ fill: AXIS, fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#fff" }} cursor={{ stroke: BORDER }} />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#00ffff"
          strokeWidth={1}
          fill="url(#snackArea)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Person donut ────────────────────────────────────────────────────────────
export function PersonDonut({
  mostActive,
  total,
  top,
}: {
  mostActive: { name: string; value: number }[];
  total: number;
  top: string[];
}) {
  const slices = mostActive.slice(0, 8).map((m) => ({ name: m.name, value: m.value }));
  const othersValue = total - slices.reduce((a, s) => a + s.value, 0);
  if (othersValue > 0) slices.push({ name: OTHERS, value: othersValue });
  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={85}
            stroke="#000"
            strokeWidth={1}
            isAnimationActive={false}
          >
            {slices.map((s) => (
              <Cell key={s.name} fill={colorFor(s.name, top)} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <Legend names={slices.map((s) => s.name)} top={top} />
    </>
  );
}

// ─── Stacked bar (messages by hour, per person) ──────────────────────────────
export function TimeOfDay({ data, top }: { data: Row[]; top: string[] }) {
  const series = [...top, OTHERS];
  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
          <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 9 }} axisLine={{ stroke: BORDER }} tickLine={false} interval={1} />
          <YAxis tick={{ fill: AXIS, fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#fff" }} cursor={{ fill: "#ffffff10" }} />
          {series.map((name) => (
            <Bar key={name} dataKey={name} stackId="h" fill={colorFor(name, top)} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Legend names={series} top={top} />
    </>
  );
}

// ─── Radar (month / weekday, per person) ─────────────────────────────────────
export function SeriesRadar({ data, top }: { data: Row[]; top: string[] }) {
  const series = top.slice(0, 6); // keep the web readable
  return (
    <>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={BORDER} />
          <PolarAngleAxis dataKey="label" tick={{ fill: AXIS, fontSize: 9 }} />
          {series.map((name) => (
            <Radar
              key={name}
              dataKey={name}
              stroke={colorFor(name, top)}
              fill={colorFor(name, top)}
              fillOpacity={0.08}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          ))}
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#fff" }} />
        </RadarChart>
      </ResponsiveContainer>
      <Legend names={series} top={top} />
    </>
  );
}

// ─── Word + emoji clouds (hand-rolled, no extra dep) ─────────────────────────
export function WordCloud({ words }: { words: { word: string; value: number }[] }) {
  const max = words[0]?.value ?? 1;
  const min = words[words.length - 1]?.value ?? 1;
  const size = (v: number) => 10 + Math.round(((v - min) / Math.max(1, max - min)) * 22);
  return (
    <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 leading-tight">
      {words.map((w, i) => (
        <span
          key={w.word}
          title={`${w.value}`}
          style={{ fontSize: size(w.value), color: SERIES[i % SERIES.length] }}
          className="tabular-nums"
        >
          {w.word}
        </span>
      ))}
    </div>
  );
}

export function EmojiCloud({ emojis }: { emojis: { emoji: string; value: number }[] }) {
  const max = emojis[0]?.value ?? 1;
  const min = emojis[emojis.length - 1]?.value ?? 1;
  const size = (v: number) => 16 + Math.round(((v - min) / Math.max(1, max - min)) * 28);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 leading-none">
      {emojis.map((e) => (
        <span key={e.emoji} title={`${e.value}`} style={{ fontSize: size(e.value) }}>
          {e.emoji}
        </span>
      ))}
    </div>
  );
}
