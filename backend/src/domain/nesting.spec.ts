import { computeNesting } from './nesting';
import { PartTooLargeError } from '../common/errors';

describe('computeNesting', () => {
  describe('fit boundary', () => {
    it('accepts a part exactly the size of the usable area', () => {
      // 1000 x 1000 sheet with a 10 mm margin leaves 980 x 980 usable.
      const result = computeNesting(980, 980, 4, 1000, 1000, 5, 10);

      expect(result.cols).toBe(1);
      expect(result.rows).toBe(1);
      expect(result.perSheet).toBe(1);
      expect(result.sheets).toBe(4);
      expect(result.placements).toHaveLength(4);
    });

    it('rejects a part 1 mm larger than the usable area', () => {
      expect(() => computeNesting(981, 980, 1, 1000, 1000, 5, 10)).toThrow(PartTooLargeError);
      expect(() => computeNesting(980, 981, 1, 1000, 1000, 5, 10)).toThrow(PartTooLargeError);
      expect(() => computeNesting(981, 980, 1, 1000, 1000, 5, 10)).toThrow(/does not fit/);
    });
  });

  describe('packing arithmetic', () => {
    // 1220 x 2440 sheet, 10 mm margin => 1200 x 2420 usable.
    // cols = floor((1200 + 5) / (100 + 5)) = floor(11.476) = 11
    // rows = floor((2420 + 5) / (100 + 5)) = floor(23.095) = 23
    const result = computeNesting(100, 100, 150, 1220, 2440, 5, 10);

    it('packs a known grid of 100 mm parts on a 1220 x 2440 sheet', () => {
      expect(result.cols).toBe(11);
      expect(result.rows).toBe(23);
      expect(result.perSheet).toBe(253);
      expect(result.sheets).toBe(1);
      expect(result.placements).toHaveLength(150);
    });

    it('places the first part at the top-left of the usable area', () => {
      expect(result.placements[0]).toEqual({ sheet: 1, x: 10, y: 10 });
    });

    it('lays parts out left to right, then top to bottom, at part + spacing pitch', () => {
      expect(result.placements[1]).toEqual({ sheet: 1, x: 10 + 105, y: 10 });
      // Slot 11 is the first of the second row.
      expect(result.placements[11]).toEqual({ sheet: 1, x: 10, y: 10 + 105 });
    });

    it('keeps every placement inside the sheet', () => {
      for (const placement of result.placements) {
        expect(placement.x).toBeGreaterThanOrEqual(10);
        expect(placement.y).toBeGreaterThanOrEqual(10);
        expect(placement.x + 100).toBeLessThanOrEqual(1220 - 10);
        expect(placement.y + 100).toBeLessThanOrEqual(2440 - 10);
      }
    });
  });

  describe('multi-sheet jobs', () => {
    const qty = 700;
    const result = computeNesting(100, 100, qty, 1220, 2440, 5, 10);

    it('uses ceil(qty / perSheet) sheets', () => {
      expect(result.perSheet).toBe(253);
      expect(result.sheets).toBe(Math.ceil(qty / result.perSheet));
      expect(result.sheets).toBe(3);
      expect(result.placements).toHaveLength(qty);
    });

    it('assigns every placement to a sheet in 1..sheets', () => {
      for (const placement of result.placements) {
        expect(placement.sheet).toBeGreaterThanOrEqual(1);
        expect(placement.sheet).toBeLessThanOrEqual(result.sheets);
        expect(Number.isInteger(placement.sheet)).toBe(true);
      }
      // The first part of each new sheet restarts at the origin.
      expect(result.placements[253]).toEqual({ sheet: 2, x: 10, y: 10 });
      expect(result.placements[506]).toEqual({ sheet: 3, x: 10, y: 10 });
    });
  });

  describe('utilization', () => {
    it('reports part area over total sheet area, within 0..1', () => {
      const result = computeNesting(100, 100, 150, 1220, 2440, 5, 10);
      const expected = (100 * 100 * 150) / (result.sheets * 1220 * 2440);

      expect(result.utilization).toBeCloseTo(expected, 12);
      expect(result.utilization).toBeGreaterThan(0);
      expect(result.utilization).toBeLessThanOrEqual(1);
    });

    it('stays within 0..1 for a part that fills the whole usable area', () => {
      const result = computeNesting(980, 980, 7, 1000, 1000, 5, 10);
      const expected = (980 * 980 * 7) / (result.sheets * 1000 * 1000);

      expect(result.utilization).toBeCloseTo(expected, 12);
      expect(result.utilization).toBeCloseTo(0.9604, 6);
      expect(result.utilization).toBeGreaterThan(0);
      expect(result.utilization).toBeLessThanOrEqual(1);
    });
  });

  describe('degenerate input', () => {
    it('rejects a part with no measurable area', () => {
      expect(() => computeNesting(0, 100, 1, 1220, 2440, 5, 10)).toThrow(PartTooLargeError);
      expect(() => computeNesting(100, 0, 1, 1220, 2440, 5, 10)).toThrow(/no measurable area/);
    });

    it('rejects a margin that consumes the whole sheet', () => {
      expect(() => computeNesting(10, 10, 1, 100, 100, 5, 50)).toThrow(PartTooLargeError);
      expect(() => computeNesting(10, 10, 1, 100, 100, 5, 50)).toThrow(/leaves no usable area/);
    });
  });
});
