/**
 * Display titles for the 8 fantasy rounds (3 group matchdays + 5 knockout
 * stages). Shared by /vm/omgang/[n] and the /vm/omgang overview.
 */
export const ROUND_TITLES: Record<number, string> = {
  1: "GRUPPSPEL · OMGÅNG 1",
  2: "GRUPPSPEL · OMGÅNG 2",
  3: "GRUPPSPEL · OMGÅNG 3",
  4: "SLUTSPEL · SEXTONDELSFINAL",
  5: "SLUTSPEL · ÅTTONDELSFINAL",
  6: "SLUTSPEL · KVARTSFINAL",
  7: "SLUTSPEL · SEMIFINAL & BRONS",
  8: "SLUTSPEL · FINAL",
};

export const isKnockoutRound = (n: number) => n >= 4;
