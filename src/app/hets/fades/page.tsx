import { RivalryShell } from "../rivalry-ui";

export const revalidate = 300;

export const metadata = {
  title: "DIIIFS FADÄS — Copa del Mundo 2026",
  description: "Kommer snart.",
};

export default function FadesPage() {
  return (
    <RivalryShell
      title="DIIIFS FADÄS"
      tagline="En egen sida tillägnad Diiifs fadäser. Vi sparar den bästa till sist."
    >
      <div className="mt-2 border border-red/40 bg-red/5 p-6 text-center">
        <p className="text-sm uppercase tracking-widest text-red">
          ⧗ KOMMER SNART
        </p>
        <p className="mt-3 text-sm text-dim">
          Den här sidan byggs sist — med omsorg. Diiif vet redan varför.
        </p>
      </div>
    </RivalryShell>
  );
}
