import Link from "next/link";
import { getViewerAuth } from "@/lib/auth";

type Section = "live" | "tabell" | "squad";

/**
 * Cross-navigation strip between the three "where the action is" pages:
 * LIVE · TABELL · MIN TRUPP. Dropped under the breadcrumb on each of those
 * pages. The current section is highlighted (yellow) but stays a link, so a
 * sub-page (e.g. /tabell/snack) can jump back to the section root; on the root
 * itself it's a harmless self-link.
 *
 * "MIN TRUPP" (the squad picker, gated behind /app) only shows for approved
 * users with a team; signed-out / pending viewers just get LIVE · TABELL — both
 * public — so the strip never links to a page that would bounce them to login.
 */
export async function SectionNav({ current }: { current: Section }) {
  const { approved, myTeamSlug } = await getViewerAuth();
  const showSquad = approved && myTeamSlug !== null;

  const items: { key: Section; label: React.ReactNode; href: string }[] = [
    {
      key: "live",
      label: (
        <>
          <span className="text-red">●</span> LIVE
        </>
      ),
      href: "/live",
    },
    { key: "tabell", label: "TABELL", href: "/tabell" },
    ...(showSquad
      ? [{ key: "squad" as const, label: "MIN TRUPP", href: "/app/squad" }]
      : []),
  ];

  return (
    <nav className="flex items-center gap-3 border-b border-border py-2 text-[11px] uppercase tracking-widest">
      {items.map((item, i) => (
        <span key={item.key} className="flex items-center gap-3">
          {i > 0 && <span className="text-dim">|</span>}
          <Link
            href={item.href}
            aria-current={item.key === current ? "page" : undefined}
            className={
              item.key === current
                ? "text-yellow"
                : "text-cyan hover:text-yellow"
            }
          >
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
