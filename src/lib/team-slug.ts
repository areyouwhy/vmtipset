/**
 * Build a URL-safe slug from a team name. Strips diacritics, drops emoji, and
 * collapses everything else to hyphenated lowercase. Team names are unique at
 * the DB level; in the rare case two names collapse to the same slug (e.g.
 * differ only by emoji) the resolver falls back to "lag" and the lookup
 * step degrades to notFound.
 */
export function teamSlug(name: string): string {
  const normalized = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "lag";
}
