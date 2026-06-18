import Image, { type StaticImageData } from "next/image";
import { RivalryShell } from "../rivalry-ui";
import kajlerDeadline from "./kajler-deadline.png";

export const revalidate = 300;

export const metadata = {
  title: "DIIIFS FADÄS — Copa del Mundo 2026",
  description: "Hall of shame: fadäser värda att minnas.",
};

type Fadas = {
  who: string;
  title: string;
  body: string;
  /** Their own defence, verbatim. */
  quote?: string;
  image?: { src: StaticImageData; alt: string };
};

const FADASER: Fadas[] = [
  {
    who: "Robert Kajler",
    title: "SPARA-KNAPPEN SOM GLAPPADE",
    body: "Fick syn på startelvorna inför Tjeckien–Sydafrika och såg svart på vitt att hans spelare var petad och satt på bänken. Lyckades ändå inte byta ut honom innan deadline.",
    quote: "Blev stressad av deadline. Spara-knappen glappade osv osv osv 😂",
    image: { src: kajlerDeadline, alt: "Kajler: blev stressad av deadline" },
  },
];

export default function FadesPage() {
  return (
    <RivalryShell
      title="DIIIFS FADÄS"
      tagline="Hall of shame. Fadäser värda att minnas."
    >
      <div className="mt-2 space-y-4">
        {FADASER.map((f, i) => (
          <article key={i} className="border border-red/40 bg-red/5 p-4">
            <header className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold uppercase tracking-widest text-red">
                {f.who}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-dim">
                FADÄS #{String(FADASER.length - i).padStart(2, "0")}
              </span>
            </header>
            <h3 className="mt-2 text-base font-bold uppercase tracking-tight text-yellow">
              {f.title}
            </h3>
            <p className="mt-2 text-sm text-dim">{f.body}</p>
            {f.quote && (
              <p className="mt-3 border-l-2 border-red/60 pl-3 text-sm italic text-foreground">
                ”{f.quote}”
              </p>
            )}
            {f.image && (
              <Image
                src={f.image.src}
                alt={f.image.alt}
                placeholder="blur"
                sizes="(max-width: 768px) 100vw, 768px"
                className="mt-3 w-full border border-border"
              />
            )}
          </article>
        ))}
      </div>
    </RivalryShell>
  );
}
