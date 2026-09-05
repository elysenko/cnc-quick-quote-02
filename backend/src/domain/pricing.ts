/** Exact millimetres in one linear foot — the unit the cutting rate is quoted in. */
export const MM_PER_FOOT = 304.8;

export interface PricingConfig {
  setupFeeCents: number;
  costPerLinearFootCents: number;
  perSheetCostCents: number;
  handlingFeeCents: number;
  costPerBendCents: number;
  minimumOrderCents: number;
  qtyMin: number;
  qtyMax: number;
}

export interface BreakdownLine {
  label: string;
  detail: string;
  amountCents: number;
}

export interface PriceResult {
  breakdown: BreakdownLine[];
  subtotalCents: number;
  totalCents: number;
}

const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/**
 * Itemised job price.
 *
 *   subtotal = setup + cutLengthFt × perFoot + sheets × perSheet × materialMultiplier
 *              + handling + bends × perBend
 *   total    = max(minimumOrder, subtotal)
 *
 * Every intermediate stays a full-precision float and is rounded to integer cents
 * exactly ONCE, at the end — rounding each line first would let per-line error
 * accumulate into a total that does not match the sum of its own breakdown.
 * The displayed line amounts are rounded for presentation only; `totalCents` is
 * computed from the unrounded subtotal.
 */
export function priceQuote(
  cutLengthMmTotal: number,
  sheets: number,
  bends: number,
  materialMultiplier: number,
  cfg: PricingConfig,
): PriceResult {
  const feet = cutLengthMmTotal / MM_PER_FOOT;
  const cutting = feet * cfg.costPerLinearFootCents;
  const sheetCost = sheets * cfg.perSheetCostCents * materialMultiplier;
  const bending = bends * cfg.costPerBendCents;
  const subtotal = cfg.setupFeeCents + cutting + sheetCost + cfg.handlingFeeCents + bending;
  const total = Math.round(Math.max(cfg.minimumOrderCents, subtotal));

  const breakdown: BreakdownLine[] = [
    { label: 'Setup fee', detail: 'Per job', amountCents: Math.round(cfg.setupFeeCents) },
    {
      label: 'Laser cutting',
      detail: `${feet.toFixed(2)} linear ft @ ${dollars(cfg.costPerLinearFootCents)}/ft`,
      amountCents: Math.round(cutting),
    },
    {
      label: 'Material sheets',
      detail: `${sheets} sheet${sheets === 1 ? '' : 's'} @ ${dollars(cfg.perSheetCostCents)} × ${materialMultiplier} multiplier`,
      amountCents: Math.round(sheetCost),
    },
    { label: 'Handling', detail: 'Deburr + pack', amountCents: Math.round(cfg.handlingFeeCents) },
    {
      label: 'Bending',
      detail: bends > 0 ? `${bends} bend${bends === 1 ? '' : 's'} @ ${dollars(cfg.costPerBendCents)}` : 'No bends',
      amountCents: Math.round(bending),
    },
  ];

  if (subtotal < cfg.minimumOrderCents) {
    breakdown.push({
      label: 'Minimum order adjustment',
      detail: `Raised to the ${dollars(cfg.minimumOrderCents)} minimum`,
      amountCents: Math.round(cfg.minimumOrderCents - subtotal),
    });
  }

  return { breakdown, subtotalCents: Math.round(subtotal), totalCents: total };
}
