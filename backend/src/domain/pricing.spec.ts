import { MM_PER_FOOT, PricingConfig, priceQuote } from './pricing';

const cfg = (overrides: Partial<PricingConfig> = {}): PricingConfig => ({
  setupFeeCents: 5000,
  costPerLinearFootCents: 250,
  perSheetCostCents: 1500,
  handlingFeeCents: 1200,
  costPerBendCents: 350,
  minimumOrderCents: 7500,
  qtyMin: 1,
  qtyMax: 1000,
  ...overrides,
});

const lineFor = (result: { breakdown: { label: string }[] }, label: string) =>
  result.breakdown.find((l) => l.label === label);

describe('MM_PER_FOOT', () => {
  it('is the exact millimetre length of one linear foot', () => {
    expect(MM_PER_FOOT).toBe(304.8);
  });
});

describe('priceQuote', () => {
  describe('normal job above the minimum', () => {
    const config = cfg();
    const cutLengthMm = 12000;
    const sheets = 3;
    const bends = 4;
    const multiplier = 1.5;
    const result = priceQuote(cutLengthMm, sheets, bends, multiplier, config);

    // Recomputed here independently of the implementation.
    const feet = 12000 / 304.8;
    const cutting = feet * 250;
    const sheetCost = 3 * 1500 * 1.5;
    const bending = 4 * 350;
    const subtotal = 5000 + cutting + sheetCost + 1200 + bending;

    it('totals setup + cutting + sheets + handling + bending', () => {
      expect(result.totalCents).toBe(Math.round(subtotal));
      expect(result.subtotalCents).toBe(Math.round(subtotal));
      expect(result.totalCents).toBe(24193);
    });

    it('itemises exactly five lines when the minimum is not engaged', () => {
      expect(result.breakdown).toHaveLength(5);
      expect(result.breakdown.map((l) => l.label)).toEqual([
        'Setup fee',
        'Laser cutting',
        'Material sheets',
        'Handling',
        'Bending',
      ]);
      expect(lineFor(result, 'Minimum order adjustment')).toBeUndefined();
    });

    it('reports each line amount and detail', () => {
      expect(lineFor(result, 'Setup fee')).toEqual({ label: 'Setup fee', detail: 'Per job', amountCents: 5000 });
      expect(lineFor(result, 'Laser cutting')).toEqual({
        label: 'Laser cutting',
        detail: `${feet.toFixed(2)} linear ft @ $2.50/ft`,
        amountCents: Math.round(cutting),
      });
      expect(lineFor(result, 'Material sheets')).toEqual({
        label: 'Material sheets',
        detail: '3 sheets @ $15.00 × 1.5 multiplier',
        amountCents: 6750,
      });
      expect(lineFor(result, 'Handling')).toEqual({
        label: 'Handling',
        detail: 'Deburr + pack',
        amountCents: 1200,
      });
      expect(lineFor(result, 'Bending')).toEqual({
        label: 'Bending',
        detail: '4 bends @ $3.50',
        amountCents: 1400,
      });
    });

    it('converts millimetres to linear feet with MM_PER_FOOT', () => {
      const oneFoot = priceQuote(MM_PER_FOOT, 0, 0, 1, cfg({ minimumOrderCents: 0 }));
      expect(lineFor(oneFoot, 'Laser cutting')!.detail).toBe('1.00 linear ft @ $2.50/ft');
      expect(lineFor(oneFoot, 'Laser cutting')!.amountCents).toBe(250);
    });
  });

  describe('minimum order floor', () => {
    const config = cfg({
      setupFeeCents: 500,
      costPerLinearFootCents: 250,
      perSheetCostCents: 800,
      handlingFeeCents: 300,
      costPerBendCents: 125,
      minimumOrderCents: 5000,
    });
    // 1 ft of cutting => 500 + 250 + 800 + 300 + 250 = 2100, well under the 5000 floor.
    const result = priceQuote(MM_PER_FOOT, 1, 2, 1, config);

    it('raises the total to exactly the minimum', () => {
      expect(result.subtotalCents).toBe(2100);
      expect(result.totalCents).toBe(5000);
      expect(result.totalCents).toBe(config.minimumOrderCents);
    });

    it('adds an adjustment line that closes the gap', () => {
      expect(result.breakdown).toHaveLength(6);
      const adjustment = lineFor(result, 'Minimum order adjustment');
      expect(adjustment).toEqual({
        label: 'Minimum order adjustment',
        detail: 'Raised to the $50.00 minimum',
        amountCents: 2900,
      });
      expect(result.subtotalCents + adjustment!.amountCents).toBe(result.totalCents);
      // The breakdown sums to the total the customer is charged.
      const sum = result.breakdown.reduce((acc, l) => acc + l.amountCents, 0);
      expect(sum).toBe(result.totalCents);
    });

    it('does not adjust when the subtotal already equals the minimum', () => {
      const exact = priceQuote(MM_PER_FOOT, 1, 2, 1, cfg({ ...config, minimumOrderCents: 2100 }));
      expect(exact.totalCents).toBe(2100);
      expect(exact.breakdown).toHaveLength(5);
      expect(lineFor(exact, 'Minimum order adjustment')).toBeUndefined();
    });
  });

  describe('materialMultiplier', () => {
    it('scales only the material sheets line', () => {
      const base = priceQuote(12000, 3, 4, 1, cfg());
      const doubled = priceQuote(12000, 3, 4, 2, cfg());

      expect(lineFor(base, 'Material sheets')!.amountCents).toBe(4500);
      expect(lineFor(doubled, 'Material sheets')!.amountCents).toBe(9000);

      for (const label of ['Setup fee', 'Laser cutting', 'Handling', 'Bending']) {
        expect(lineFor(doubled, label)).toEqual(lineFor(base, label));
      }

      expect(doubled.totalCents - base.totalCents).toBe(4500);
    });
  });

  describe('bends', () => {
    it('renders "No bends" with a zero amount when there are none', () => {
      const result = priceQuote(12000, 3, 0, 1, cfg());
      expect(lineFor(result, 'Bending')).toEqual({
        label: 'Bending',
        detail: 'No bends',
        amountCents: 0,
      });
    });

    it('singularises a lone bend', () => {
      const result = priceQuote(12000, 1, 1, 1, cfg());
      expect(lineFor(result, 'Bending')!.detail).toBe('1 bend @ $3.50');
      expect(lineFor(result, 'Material sheets')!.detail).toBe('1 sheet @ $15.00 × 1 multiplier');
    });
  });

  describe('rounding', () => {
    it('always returns integer cents for a range of awkward inputs', () => {
      const cases: Array<[number, number, number, number]> = [
        [0, 0, 0, 1],
        [1, 1, 1, 1.07],
        [12345.678, 2, 3, 1.333333],
        [999999.9, 17, 11, 0.9375],
        [7.77, 1, 0, 2.5],
      ];

      for (const [cut, sheets, bends, multiplier] of cases) {
        const result = priceQuote(cut, sheets, bends, multiplier, cfg());
        expect(Number.isInteger(result.totalCents)).toBe(true);
        expect(Number.isInteger(result.subtotalCents)).toBe(true);
        for (const line of result.breakdown) {
          expect(Number.isInteger(line.amountCents)).toBe(true);
        }
      }
    });

    it('rounds the total once from the unrounded subtotal', () => {
      // 10 ft @ $2.50/ft = 2500 exactly; the half-cent comes from the 1.005 multiplier
      // (1500 * 1.005 = 1507.5), so the single final rounding must land on 4008.
      const config = cfg({ setupFeeCents: 0, handlingFeeCents: 0, costPerBendCents: 0, minimumOrderCents: 0 });
      const result = priceQuote(MM_PER_FOOT * 10, 1, 0, 1.005, config);
      const expected = 10 * 250 + 1 * 1500 * 1.005;

      expect(result.totalCents).toBe(Math.round(expected));
      expect(result.totalCents).toBe(4008);
    });
  });
});
