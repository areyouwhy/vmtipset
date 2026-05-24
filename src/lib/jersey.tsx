import { jerseyPath } from "./jersey-map";

/** Small country jersey thumbnail (e.g. for list rows + filters). Returns
 *  null when the country has no baked jersey so callers can fall through. */
export function Jersey({
  code,
  size = 24,
  className = "",
}: {
  code: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const src = jerseyPath(code);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Larger jersey rendered on the pitch / lineup view. Falls back to a flat
 *  country-code square when no jersey is baked for that code.
 *
 *  `size` is the desktop/max size. On narrow viewports the rendered jersey
 *  scales down so four rows of chips can fit inside the pitch without
 *  overflowing. Pass `responsive={false}` to opt out and pin to `size`. */
export function PitchJersey({
  countryCode,
  size = 84,
  responsive = true,
  ringClass = "",
}: {
  countryCode: string | null | undefined;
  size?: number;
  responsive?: boolean;
  ringClass?: string;
}) {
  const src = jerseyPath(countryCode);
  // clamp(minPx, viewport-relative preferred, maxPx) → caps at `size` on
  // wider screens, shrinks to 14vw on narrow ones (≈ 56px at iPhone width).
  const dim = responsive
    ? `clamp(48px, 15vw, ${size}px)`
    : `${size}px`;
  if (!src) {
    return (
      <span
        className={`flex items-center justify-center bg-[#222] text-[10px] font-bold uppercase tracking-wider text-yellow ${ringClass}`}
        style={{ width: dim, height: dim }}
      >
        {countryCode ?? "—"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={`block ${ringClass}`}
      style={{ width: dim, height: dim }}
    />
  );
}
