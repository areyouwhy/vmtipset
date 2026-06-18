/**
 * Client-safe reaction palette. Kept separate from `reactions.ts` (which imports
 * the server-only `@/db`) so client components can import the emoji list without
 * dragging the DB module into the browser bundle.
 */

/** The fixed reaction palette (server validates against this; client renders it). */
export const FADES_EMOJIS = ["🙏🏽", "🫶🏽", "😂", "🔥", "🤡", "🫡"] as const;
export type FadesEmoji = (typeof FADES_EMOJIS)[number];
