import { parseDxf } from './dxf-parser';
import { DxfParseError } from '../common/errors';

/**
 * Builds an ASCII DXF buffer around an ENTITIES section. DXF is strictly
 * line-paired: an integer group code line followed by its value line.
 */
const dxf = (entityLines: string[]): Buffer =>
  Buffer.from(['0', 'SECTION', '2', 'ENTITIES', ...entityLines, '0', 'ENDSEC', '0', 'EOF', ''].join('\n'), 'utf8');

const line = (x0: number, y0: number, x1: number, y1: number): string[] => [
  '0',
  'LINE',
  '8',
  '0',
  '10',
  String(x0),
  '20',
  String(y0),
  '11',
  String(x1),
  '21',
  String(y1),
];

/** Smallest x / y across every flat path, used to prove the (0,0) origin shift. */
const minCoord = (paths: number[][], axis: 0 | 1): number => {
  let min = Infinity;
  for (const path of paths) {
    for (let i = axis; i < path.length; i += 2) {
      if (path[i] < min) min = path[i];
    }
  }
  return min;
};

describe('parseDxf', () => {
  describe('LINE entities', () => {
    it('measures a 100 mm square built from four LINE entities exactly', () => {
      const geometry = parseDxf(
        dxf([
          ...line(0, 0, 100, 0),
          ...line(100, 0, 100, 100),
          ...line(100, 100, 0, 100),
          ...line(0, 100, 0, 0),
        ]),
      );

      expect(geometry.cutLengthMm).toBe(400);
      expect(geometry.bboxWMm).toBe(100);
      expect(geometry.bboxHMm).toBe(100);
      expect(geometry.entityCount).toBe(4);
      expect(geometry.paths).toHaveLength(4);
    });

    it('normalises coordinates so the bounding box starts at (0, 0)', () => {
      const geometry = parseDxf(
        dxf([
          ...line(50, 50, 150, 50),
          ...line(150, 50, 150, 150),
          ...line(150, 150, 50, 150),
          ...line(50, 150, 50, 50),
        ]),
      );

      expect(minCoord(geometry.paths, 0)).toBe(0);
      expect(minCoord(geometry.paths, 1)).toBe(0);
      expect(geometry.bboxWMm).toBe(100);
      expect(geometry.bboxHMm).toBe(100);
      // The shape itself is unchanged: still a 100 mm square, first path along y = 0.
      expect(geometry.paths[0]).toEqual([0, 0, 100, 0]);
      expect(geometry.cutLengthMm).toBe(400);
    });
  });

  describe('CIRCLE entities', () => {
    const circle = parseDxf(dxf(['0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '40', '50']));

    it('prices a circle on its true circumference, not the tessellated polyline', () => {
      expect(circle.cutLengthMm).toBeCloseTo(2 * Math.PI * 50, 6);
      expect(circle.cutLengthMm).toBeCloseTo(314.159265, 5);
      expect(circle.entityCount).toBe(1);
    });

    it('bounds a circle analytically, so the bbox is exactly the diameter', () => {
      // This is the whole point of the analytic Bounds accumulator: a 4-degree
      // tessellation would under-measure each side by r * (1 - cos(2 deg)).
      expect(circle.bboxWMm).toBe(100);
      expect(circle.bboxHMm).toBe(100);
    });
  });

  describe('ARC entities', () => {
    it('measures a quarter arc as r * sweep', () => {
      const geometry = parseDxf(
        dxf(['0', 'ARC', '8', '0', '10', '0', '20', '0', '40', '50', '50', '0', '51', '90']),
      );

      expect(geometry.cutLengthMm).toBeCloseTo(50 * (Math.PI / 2), 9);
      expect(geometry.cutLengthMm).toBeCloseTo(78.539816, 5);
      expect(geometry.entityCount).toBe(1);
      // A 0..90 degree arc of radius 50 spans exactly the first quadrant.
      expect(geometry.bboxWMm).toBeCloseTo(50, 9);
      expect(geometry.bboxHMm).toBeCloseTo(50, 9);
    });
  });

  describe('LWPOLYLINE entities', () => {
    it('expands a bulge of 1 into a semicircle rather than a chord', () => {
      const geometry = parseDxf(
        dxf([
          '0',
          'LWPOLYLINE',
          '8',
          '0',
          '90',
          '2',
          '70',
          '0',
          '10',
          '0',
          '20',
          '0',
          '42',
          '1',
          '10',
          '100',
          '20',
          '0',
        ]),
      );

      const chord = 100;
      // bulge = tan(theta/4); bulge 1 => theta = PI => arc length = chord * PI / 2.
      expect(geometry.cutLengthMm).toBeCloseTo((chord * Math.PI) / 2, 9);
      expect(geometry.cutLengthMm).toBeCloseTo(157.079632, 5);
      expect(geometry.cutLengthMm).toBeGreaterThan(chord);
      expect(geometry.entityCount).toBe(1);
      // Semicircle on a 100 mm chord: 100 wide, 50 deep.
      expect(geometry.bboxWMm).toBeCloseTo(100, 6);
      expect(geometry.bboxHMm).toBeCloseTo(50, 6);
    });

    it('closes the ring when flag 70 = 1 and all bulges are 0', () => {
      const geometry = parseDxf(
        dxf([
          '0',
          'LWPOLYLINE',
          '8',
          '0',
          '90',
          '3',
          '70',
          '1',
          '10',
          '0',
          '20',
          '0',
          '42',
          '0',
          '10',
          '30',
          '20',
          '0',
          '42',
          '0',
          '10',
          '0',
          '20',
          '40',
          '42',
          '0',
        ]),
      );

      // 3-4-5 triangle: 30 + 50 + 40, including the closing segment back to (0,0).
      expect(geometry.cutLengthMm).toBe(120);
      expect(geometry.bboxWMm).toBe(30);
      expect(geometry.bboxHMm).toBe(40);
      expect(geometry.entityCount).toBe(1);
      expect(geometry.paths).toHaveLength(1);
    });

    it('drops the closing segment when flag 70 = 0', () => {
      const open = parseDxf(
        dxf([
          '0',
          'LWPOLYLINE',
          '8',
          '0',
          '90',
          '3',
          '70',
          '0',
          '10',
          '0',
          '20',
          '0',
          '42',
          '0',
          '10',
          '30',
          '20',
          '0',
          '42',
          '0',
          '10',
          '0',
          '20',
          '40',
          '42',
          '0',
        ]),
      );

      expect(open.cutLengthMm).toBe(80);
    });
  });

  describe('rejected input', () => {
    it('throws DxfParseError when the ENTITIES section is empty', () => {
      const empty = dxf([]);
      expect(() => parseDxf(empty)).toThrow(DxfParseError);
      expect(() => parseDxf(empty)).toThrow(/no supported entities were found/);
    });

    it('throws DxfParseError for garbage that is not a DXF at all', () => {
      const garbage = Buffer.from('hello there, this is a plain text note and not a drawing.\n', 'utf8');
      expect(() => parseDxf(garbage)).toThrow(DxfParseError);
      expect(() => parseDxf(garbage)).toThrow(/does not contain a DXF SECTION header/);
    });

    it('throws DxfParseError when only unsupported entities are present', () => {
      const textOnly = dxf(['0', 'TEXT', '8', '0', '10', '0', '20', '0', '1', 'PART A']);
      expect(() => parseDxf(textOnly)).toThrow(DxfParseError);
    });
  });
});

describe('parseDxf — open profile bounds regression', () => {
  const dxf = (entities: string): Buffer =>
    Buffer.from(`0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`, 'utf8');

  /**
   * Regression: buildVertexPath used to bound only each segment's START vertex. On a
   * closed ring every vertex is eventually a start, so the bug was invisible there —
   * but an OPEN profile's terminal vertex was never bounded, truncating the bbox.
   */
  it('bounds the terminal vertex of an open polyline', () => {
    const result = parseDxf(
      dxf('0\nLWPOLYLINE\n8\n0\n90\n3\n70\n0\n10\n0\n20\n0\n10\n30\n20\n0\n10\n0\n20\n40\n'),
    );
    expect(result.bboxWMm).toBe(30);
    expect(result.bboxHMm).toBe(40);
  });

  it('normalises an open polyline with negative coordinates to a (0,0) origin', () => {
    const result = parseDxf(dxf('0\nLWPOLYLINE\n8\n0\n90\n2\n70\n0\n10\n0\n20\n0\n10\n-50\n20\n-50\n'));
    expect(result.bboxWMm).toBe(50);
    expect(result.bboxHMm).toBe(50);
    const xs = result.paths.flatMap((p) => p.filter((_, i) => i % 2 === 0));
    const ys = result.paths.flatMap((p) => p.filter((_, i) => i % 2 === 1));
    expect(Math.min(...xs)).toBe(0);
    expect(Math.min(...ys)).toBe(0);
  });
});
