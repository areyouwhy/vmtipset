import Image from "next/image";
import { Breadcrumbs } from "@/components/breadcrumbs";
import bielsa from "./bielsa.jpg";

export const revalidate = 3600;

export const metadata = {
  title: "VIBES — La Copa del Mundo 2026",
  description: "Stämningshöjare inför VM 2026.",
};

// Curated clips (YouTube ids), newest first. Add more over time.
const VIDEOS: { id: string; title: string; by: string }[] = [
  {
    id: "7RogQiih3M8",
    title: "WORLD CUP 2026 — AI Fan Film",
    by: "Blue Horizon",
  },
];

export default function VibesPage() {
  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Breadcrumbs trail={[{ label: "VIBES" }]} />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            VIBES
          </h1>
        </section>

        <div className="space-y-8">
          <Image
            src={bielsa}
            alt="Marcelo Bielsa"
            placeholder="blur"
            className="w-full border border-border"
            sizes="(max-width: 640px) 100vw, 640px"
          />
          {VIDEOS.map((v) => (
            <figure key={v.id}>
              <div
                className="relative w-full overflow-hidden border border-border"
                style={{ aspectRatio: "16 / 9" }}
              >
                <iframe
                  className="absolute inset-0 h-full w-full"
                  src={`https://www.youtube-nocookie.com/embed/${v.id}`}
                  title={v.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
              <figcaption className="mt-2 text-[10px] uppercase tracking-widest text-dim">
                {v.title} · {v.by}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </main>
  );
}
