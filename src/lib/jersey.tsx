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
 *  country-code square when no jersey is baked for that code. */
export function PitchJersey({
  countryCode,
  size = 84,
  ringClass = "",
}: {
  countryCode: string | null | undefined;
  size?: number;
  ringClass?: string;
}) {
  const src = jerseyPath(countryCode);
  if (!src) {
    return (
      <span
        className={`flex items-center justify-center bg-[#222] text-[10px] font-bold uppercase tracking-wider text-yellow ${ringClass}`}
        style={{ width: size, height: size }}
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
      style={{ width: size, height: size }}
    />
  );
}
