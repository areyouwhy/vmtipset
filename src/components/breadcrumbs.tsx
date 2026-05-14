import Link from "next/link";

export type Crumb = {
  label: string;
  /** Omit href on the last crumb (current page). */
  href?: string;
};

/**
 * Top-of-page breadcrumb row. Renders the trail as "A / B / C" with each
 * crumb but the last being a link. Always prepends COPA → "/" so users
 * can get home from anywhere.
 */
export function Breadcrumbs({
  trail,
  right,
}: {
  trail: Crumb[];
  right?: React.ReactNode;
}) {
  const full: Crumb[] = [{ label: "COPA", href: "/" }, ...trail];
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border pb-3 text-xs uppercase tracking-widest">
      <nav className="flex min-w-0 items-center gap-1 truncate">
        {full.map((c, i) => {
          const isLast = i === full.length - 1;
          return (
            <span key={i} className="flex shrink-0 items-center gap-1">
              {i > 0 && <span className="text-dim">/</span>}
              {c.href && !isLast ? (
                <Link
                  href={c.href}
                  className="text-cyan transition hover:text-yellow"
                >
                  {c.label}
                </Link>
              ) : (
                <span className={isLast ? "text-yellow" : "text-cyan"}>
                  {c.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      {right ? <div className="shrink-0 text-dim">{right}</div> : null}
    </header>
  );
}
