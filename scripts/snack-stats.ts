/**
 * Parse a WhatsApp chat export (_chat.txt, iOS format) into AGGREGATED stats
 * for the /tabell/snack page. Only counts + names + a couple of short snippets
 * are written — never the raw message log — so no private chat content lands in
 * the repo beyond what's deliberately surfaced.
 *
 *   npx tsx scripts/snack-stats.ts /path/to/_chat.txt
 *
 * Defaults to /tmp/copachat/_chat.txt. Writes src/data/snack-stats.json.
 * Re-run + commit the JSON to refresh after a new export.
 */

import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.argv[2] ?? "/tmp/copachat/_chat.txt";
const OUT = "src/data/snack-stats.json";

const INVIS = /[‎‏‪-‮⁦-⁩]/g;
const LINE =
  /^\[(\d{4})-(\d{2})-(\d{2}), (\d{2}):(\d{2}):(\d{2})\] (.*?): (.*)$/;

type Msg = { t: Date; sender: string; text: string };

function parse(path: string): Msg[] {
  const raw = readFileSync(path, "utf8");
  const out: Msg[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const s = line.replace(INVIS, "");
    const m = LINE.exec(s);
    if (m) {
      const [, y, mo, d, h, mi, se] = m;
      out.push({
        t: new Date(+y, +mo - 1, +d, +h, +mi, +se),
        sender: m[7].trim(),
        text: m[8],
      });
    } else if (out.length) {
      out[out.length - 1].text += "\n" + s;
    }
  }
  return out;
}

function norm(name: string): string {
  return name.replace(/ /g, " ").replace(/^~\s*/, "").trim();
}

const SYS =
  /(joined using|added you|was added|^left$| left$|removed|changed the (group|subject)|changed this group|changed their phone number|created (this )?group|end-to-end encrypted|now an admin|no longer an admin|changed the group description|pinned a message|security code changed|deleted this group|You were added|changed the group icon|changed the group settings|This message was deleted)/i;

const MEDIA: Record<string, string> = {
  "image omitted": "photo",
  "video omitted": "video",
  "GIF omitted": "gif",
  "sticker omitted": "sticker",
  "audio omitted": "voice",
};
const URL = /https?:\/\//;
// Count whole emoji graphemes (flags, skin tones, ZWJ sequences stay intact)
// rather than raw code points, so the cloud shows 😂 / ❤️ / 🇦🇷 not fragments.
const GRAPHEME = new Intl.Segmenter("sv", { granularity: "grapheme" });
const EMOJI_G = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
function emojisIn(s: string): string[] {
  const out: string[] = [];
  for (const { segment } of GRAPHEME.segment(s)) {
    if (EMOJI_G.test(segment)) out.push(segment);
  }
  return out;
}
const LAUGH = /(\ba+ha+h[ha]*\b|\bha(ha)+\b|\blol\b|\basg\b|😂|🤣|💀)/i;

const DOW = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"]; // getDay(): 0=Sun
const DOW_FROM_SUN = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

// Stopwords (Swedish + English + chat noise) for the word cloud.
const STOP = new Set(
  ("och att det som en ett är jag du han hon vi ni de dem den det på i för med av till har inte om men så kan ska var vad ja nej eller har hade ha haha man mig dig sig oss er vår din sin mitt v?r att den de det här där när hur vem vilka vilken vilket bara nu då ju väl nog lite mer mest också även samt över under efter före utan mot från vid per ens helt blir bli blev blivit kommer kom skulle vill ville får fick gör gjorde sa säger om this that the a an to of and is it in you he she we they on for with at as be are was were have has had do does did not no yes or but so if then than them his her our your my me i u im its dont cant just like get got im so do re ll ve omitted image video gif sticker audio message deleted https http www com").split(
    /\s+/,
  ),
);

type Lead = { name: string; value: number };

function lead(map: Map<string, number>, n: number): Lead[] {
  return [...map.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, value]) => ({ name, value }));
}
function add<K>(map: Map<K, number>, k: K, v = 1) {
  map.set(k, (map.get(k) ?? 0) + v);
}

const TOP_SERIES = 8; // people charted individually; rest folded into "Övriga".
const OTHERS = "Övriga";

function computeScope(msgs: Msg[]) {
  const count = new Map<string, number>();
  const media: Record<string, Map<string, number>> = {
    photo: new Map(),
    video: new Map(),
    gif: new Map(),
    sticker: new Map(),
    voice: new Map(),
  };
  const links = new Map<string, number>();
  const emoji = new Map<string, number>();
  const questions = new Map<string, number>();
  const shouts = new Map<string, number>();
  const laughs = new Map<string, number>();
  const words = new Map<string, number>();
  const textMsgs = new Map<string, number>();
  const starters = new Map<string, number>();
  const night = new Map<string, number>();
  const hour = new Map<number, number>();
  const dow = new Map<number, number>();
  // chart matrices, filled in a 2nd pass once we know the top people
  const perDay = new Map<string, number>();
  const emojiFreq = new Map<string, number>();
  const wordFreq = new Map<string, number>();
  let total = 0;
  let first: Msg | null = null;
  let last: Msg | null = null;
  let prev: Date | null = null;
  let longest = { name: "", chars: 0, preview: "" };

  const clean: { sender: string; t: Date; body: string; isMedia: boolean }[] = [];

  for (const msg of msgs) {
    const sender = norm(msg.sender);
    const body = msg.text.replace(INVIS, "").trim();
    if (msg.sender.includes("LA COPA DO MUNDO") || SYS.test(body) || !sender)
      continue;
    total++;
    if (!first) first = msg;
    last = msg;
    add(count, sender);
    add(hour, msg.t.getHours());
    add(dow, msg.t.getDay());
    add(perDay, fmt(msg.t));
    if (msg.t.getHours() < 5) add(night, sender);
    if (prev === null || msg.t.getTime() - prev.getTime() > 3 * 3600 * 1000)
      add(starters, sender);
    prev = msg.t;

    let isMedia = false;
    for (const [marker, kind] of Object.entries(MEDIA)) {
      const c = body.split(marker).length - 1;
      if (c > 0) {
        add(media[kind], sender, c);
        isMedia = true;
      }
    }
    const stripped = body.replace(/(image|video|GIF|sticker|audio) omitted/g, "").trim();
    clean.push({ sender, t: msg.t, body: stripped, isMedia });
    if (isMedia && stripped === "") continue;

    add(textMsgs, sender);
    add(words, sender, stripped.split(/\s+/).filter(Boolean).length);
    const es = emojisIn(stripped);
    if (es.length) {
      add(emoji, sender, es.length);
      for (const ch of es) add(emojiFreq, ch);
    }
    if (URL.test(stripped)) add(links, sender);
    if (stripped.includes("?")) add(questions, sender);
    if (LAUGH.test(stripped)) add(laughs, sender);
    const letters = stripped.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (letters.length >= 6) {
      const up = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
      if (up / letters.length > 0.7) add(shouts, sender);
    }
    if (stripped.length > longest.chars) {
      longest = { name: sender, chars: stripped.length, preview: stripped.slice(0, 140) };
    }
    // word frequencies
    for (const w of stripped.toLowerCase().match(/[a-zà-ÿåäö]{3,}/giu) ?? []) {
      if (!STOP.has(w)) add(wordFreq, w);
    }
  }

  // Top people (for the charted series) + their rank-coloured order.
  const topPeople = [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_SERIES)
    .map(([n]) => n);
  const topSet = new Set(topPeople);
  const seriesKey = (s: string) => (topSet.has(s) ? s : OTHERS);

  // hour × person, month × person, weekday × person matrices
  const hourMx = init24(topPeople);
  const monthMx = initN(MONTHS, topPeople);
  const dayMx = initN(DOW_FROM_SUN, topPeople);
  for (const c of clean) {
    hourMx[c.t.getHours()][seriesKey(c.sender)]++;
    monthMx[c.t.getMonth()][seriesKey(c.sender)]++;
    dayMx[c.t.getDay()][seriesKey(c.sender)]++;
  }

  const wordiest = [...textMsgs.entries()]
    .filter(([, n]) => n >= 30)
    .map(([name, n]) => ({ name, value: +((words.get(name) ?? 0) / n).toFixed(1) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const quietest = [...count.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const hourTop = [...hour.entries()].sort((a, b) => b[1] - a[1]);
  const dowTop = [...dow.entries()].sort((a, b) => b[1] - a[1]);

  return {
    meta: {
      total,
      people: count.size,
      first: first ? fmt(first.t) : null,
      last: last ? fmt(last.t) : null,
      days: first && last ? Math.round((last.t.getTime() - first.t.getTime()) / 86400000) : 0,
      firstAuthor: first ? norm(first.sender) : null,
      busiestHour: hourTop[0]?.[0] ?? null,
      busiestDay: dowTop[0] !== undefined ? DOW[(dowTop[0][0] + 6) % 7] : null,
    },
    topPeople,
    mostActive: lead(count, 12).map((l) => ({ ...l, pct: +((l.value / total) * 100).toFixed(1) })),
    quietest,
    photos: lead(media.photo, 6),
    videos: lead(media.video, 6),
    gifs: lead(media.gif, 6),
    stickers: lead(media.sticker, 6),
    voice: lead(media.voice, 6),
    links: lead(links, 6),
    emojis: lead(emoji, 6),
    questions: lead(questions, 6),
    shouters: lead(shouts, 6),
    laughs: lead(laughs, 6),
    starters: lead(starters, 6),
    nightOwls: lead(night, 6),
    wordiest,
    longest,
    // charts
    timeline: [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
    hourByPerson: hourMx.map((row, h) => ({ label: String(h).padStart(2, "0"), ...row })),
    monthByPerson: monthMx.map((row, i) => ({ label: MONTHS[i], ...row })),
    weekdayByPerson: DOW_FROM_SUN.map((_, i) => ({ label: DOW_FROM_SUN[i], ...dayMx[i] })),
    topWords: [...wordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([word, value]) => ({ word, value })),
    topEmojis: [...emojiFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([emoji, value]) => ({ emoji, value })),
  };
}

function init24(people: string[]): Record<string, number>[] {
  return Array.from({ length: 24 }, () => zeroRow(people));
}
function initN(labels: string[], people: string[]): Record<string, number>[] {
  return labels.map(() => zeroRow(people));
}
function zeroRow(people: string[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const p of people) r[p] = 0;
  r[OTHERS] = 0;
  return r;
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const all = parse(SRC);
const data = {
  generatedAt: fmt(new Date()),
  allTime: computeScope(all),
  copa26: computeScope(all.filter((m) => m.t.getFullYear() === 2026)),
};
writeFileSync(OUT, JSON.stringify(data));
console.log(
  `wrote ${OUT}: allTime ${data.allTime.meta.total} msgs / ${data.allTime.meta.people} ppl (${data.allTime.timeline.length} days), copa26 ${data.copa26.meta.total} msgs`,
);
