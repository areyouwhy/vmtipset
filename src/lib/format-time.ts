/**
 * Time formatting for the UI. The audience is in Sweden, and all instants are
 * stored as UTC — render them in Europe/Stockholm so e.g. a 16:00 UTC deadline
 * shows as 18:00, not the raw UTC value.
 */

const STOCKHOLM_TZ = "Europe/Stockholm";

/** "YYYY-MM-DD HH:MM" in Swedish local time. */
export function formatStockholm(instant: Date | string): string {
  return new Date(instant)
    .toLocaleString("sv-SE", {
      timeZone: STOCKHOLM_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");
}
