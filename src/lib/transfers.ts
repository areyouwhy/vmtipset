/**
 * Pure transfer-diff calculation. Compares a previous squad to a new squad
 * and returns the list of transfer rows to write, with their fees.
 *
 * Fee model: `feeSek = floor(sellPrice × transferFeePct)`. The first
 * `freeTransfersPerRound` transfers in a single submission are free.
 *
 * Pairing: outgoing and incoming player ids are zipped in iteration order.
 * Validation already enforced position counts globally, so cross-position
 * swaps (e.g. sell DEF, buy MID) can happen but as long as the resulting
 * squad is legal that's fine — each pair is recorded as one transfer.
 */

export type TransferRow = {
  playerOutId: string;
  playerInId: string;
  /** Outgoing player's market price at this round — bank credit. */
  sellPriceSek: number;
  /** Incoming player's market price at this round — bank debit. */
  buyPriceSek: number;
  feeSek: number;
};

export type TransferDiff = {
  rows: TransferRow[];
  totalFeeSek: number;
  /** Σ (sell − buy) across all transfers in this submission. Can be ±. */
  totalCashFlowSek: number;
  freeUsed: number;
  paidCount: number;
};

export function computeTransfers(args: {
  previousPlayerIds: string[];
  newPlayerIds: string[];
  /** Current-round market prices by player id. */
  priceByPlayerId: Map<string, number>;
  transferFeePct: number; // 0.01 = 1%
  freeTransfersPerRound: number;
}): TransferDiff {
  const prev = new Set(args.previousPlayerIds);
  const next = new Set(args.newPlayerIds);

  const removed = args.previousPlayerIds.filter((id) => !next.has(id));
  const added = args.newPlayerIds.filter((id) => !prev.has(id));

  const pairs = Math.min(removed.length, added.length);
  const rows: TransferRow[] = [];
  let totalFee = 0;
  let totalCashFlow = 0;
  let freeUsed = 0;
  let paid = 0;

  for (let i = 0; i < pairs; i++) {
    const outId = removed[i];
    const inId = added[i];
    const sellPrice = args.priceByPlayerId.get(outId) ?? 0;
    const buyPrice = args.priceByPlayerId.get(inId) ?? 0;
    const isFree = freeUsed < args.freeTransfersPerRound;
    const feeSek = isFree ? 0 : Math.floor(sellPrice * args.transferFeePct);
    if (isFree) freeUsed++;
    else paid++;
    rows.push({
      playerOutId: outId,
      playerInId: inId,
      sellPriceSek: sellPrice,
      buyPriceSek: buyPrice,
      feeSek,
    });
    totalFee += feeSek;
    totalCashFlow += sellPrice - buyPrice;
  }

  return {
    rows,
    totalFeeSek: totalFee,
    totalCashFlowSek: totalCashFlow,
    freeUsed,
    paidCount: paid,
  };
}
