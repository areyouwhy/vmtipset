import type { DataSource, ExternalDataset } from "./types";

/**
 * Real Aftonbladet API client. Stub for now — once the WC 2026 manager
 * endpoints are public, fill in `fetchAll()` to fetch + map them into
 * the `ExternalDataset` shape.
 *
 * The previous Astro version proxied:
 *   GET https://api-manager.aftonbladet.se/...
 * which we should refer back to when wiring this up. Until then, callers
 * should depend on `mockSource` so the rest of the system is exercisable.
 */
export const aftonbladetSource: DataSource = {
  id: "aftonbladet",
  async fetchAll(): Promise<ExternalDataset> {
    throw new Error(
      "aftonbladetSource.fetchAll: not implemented yet — use mockSource until the WC 2026 endpoints are wired up",
    );
  },
};
