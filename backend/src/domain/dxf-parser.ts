import { DxfParseError } from '../common/errors';

/** Flat polyline in drawing units (mm): [x0,y0,x1,y1,…]. Matches the canvas contract. */
export type FlatPath = number[];

export interface ParsedGeometry {
  paths: FlatPath[];
  /** Total cut length in mm — the sum of every supported entity's true arc length. */
  cutLengthMm: number;
  bboxWMm: number;
  bboxHMm: number;
  entityCount: number;
}

/** Group-code/value pair as it appears in an ASCII DXF file. */
interface Tag {
  code: number;
  value: string;
}

const SUPPORTED = new Set(['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE']);
/** Arc/circle tessellation target: one segment per ~4° keeps curves smooth on screen. */
const DEGREES_PER_SEGMENT = 4;
const MIN_SEGMENTS = 8;
const MAX_SEGMENTS = 360;

/**
 * Splits an ASCII DXF into group-code/value pairs. DXF is strictly line-paired:
 * an integer group code line, then its value line. Tolerates CRLF and the leading
 * whitespace that many CAD exporters pad group codes with.
 */
function tokenize(text: string): Tag[] {
  const lines = text.split(/\r\n|\r|\n/);
  const tags: Tag[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) {
      throw new DxfParseError(
        `Could not parse the drawing: expected a DXF group code at line ${i + 1}, found "${lines[i].trim().slice(0, 32)}".`,
      );
    }
    tags.push({ code, value: lines[i + 1] ?? '' });
  }
  return tags;
}

const num = (tag: Tag | undefined): number => {
  const value = Number(tag?.value.trim());
  return Number.isFinite(value) ? value : 0;
};

function segmentsFor(sweepRadians: number): number {
  const degrees = Math.abs((sweepRadians * 180) / Math.PI);
  return Math.min(MAX_SEGMENTS, Math.max(MIN_SEGMENTS, Math.ceil(degrees / DEGREES_PER_SEGMENT)));
}

/** Samples an arc into a flat point list. Signed sweep keeps CW/CCW direction. */
function arcPoints(cx: number, cy: number, r: number, startRad: number, sweepRad: number): FlatPath {
  const steps = segmentsFor(sweepRad);
  const path: FlatPath = [];
  for (let i = 0; i <= steps; i++) {
    const angle = startRad + (sweepRad * i) / steps;
    path.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  return path;
}

/**
 * Exact bounding box accumulator.
 *
 * Bounds are tracked ANALYTICALLY rather than from the tessellated points, because
 * the bounding box feeds the nesting engine and therefore the sheet count on a
 * priced quote. Sampling a circle every 4 degrees under-measures its extent by
 * r*(1-cos(2 deg)) per side, which would silently shrink the part and could let an
 * oversized job pass the fit check.
 */
class Bounds {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  addPoint(x: number, y: number): void {
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }

  /**
   * Adds a circular arc: both endpoints, plus each axis extremum (0/90/180/270 deg)
   * that the sweep actually crosses. `sweep` is signed; negative means clockwise.
   */
  addArc(cx: number, cy: number, r: number, start: number, sweep: number): void {
    this.addPoint(cx + r * Math.cos(start), cy + r * Math.sin(start));
    this.addPoint(cx + r * Math.cos(start + sweep), cy + r * Math.sin(start + sweep));
    const from = sweep >= 0 ? start : start + sweep;
    const span = Math.abs(sweep);
    const TWO_PI = Math.PI * 2;
    for (let quadrant = 0; quadrant < 4; quadrant++) {
      const angle = (quadrant * Math.PI) / 2;
      // Offset of this axis angle from the sweep start, normalised into [0, 2*PI).
      let delta = (angle - from) % TWO_PI;
      if (delta < 0) delta += TWO_PI;
      if (delta <= span) this.addPoint(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
  }
}

/**
 * Expands a bulged polyline segment into an arc.
 *
 * A DXF bulge is `tan(theta/4)` where `theta` is the arc's included angle, signed
 * CCW-positive. From the chord length `c`: `R = c / (2 sin(theta/2))` and the arc
 * length is `R * |theta|` — which is what the quote is priced on, NOT the chord.
 */
function bulgeArc(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bulge: number,
): { points: FlatPath; length: number; arc?: { cx: number; cy: number; r: number; start: number; sweep: number } } {
  const chord = Math.hypot(x1 - x0, y1 - y0);
  const theta = 4 * Math.atan(bulge);
  const halfSin = Math.sin(theta / 2);
  if (chord === 0 || Math.abs(halfSin) < 1e-12) {
    return { points: [x1, y1], length: chord };
  }
  const radius = chord / (2 * halfSin);
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  // Apothem: signed distance from the chord midpoint to the arc centre.
  const apothem = radius * Math.cos(theta / 2);
  const nx = -(y1 - y0) / chord;
  const ny = (x1 - x0) / chord;
  const cx = midX + nx * apothem;
  const cy = midY + ny * apothem;
  const startAngle = Math.atan2(y0 - cy, x0 - cx);
  const sampled = arcPoints(cx, cy, Math.abs(radius), startAngle, theta);
  return {
    points: sampled.slice(2),
    length: Math.abs(radius * theta),
    arc: { cx, cy, r: Math.abs(radius), start: startAngle, sweep: theta },
  };
}

/** Straight-line length of a flat path — used for LINE and tessellated fallbacks. */
function polylineLength(path: FlatPath): number {
  let total = 0;
  for (let i = 2; i < path.length; i += 2) {
    total += Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
  }
  return total;
}

interface Accumulator {
  paths: FlatPath[];
  length: number;
  count: number;
  bounds: Bounds;
}

function readLine(tags: Tag[], acc: Accumulator): void {
  const at = (code: number) => tags.find((t) => t.code === code);
  const x0 = num(at(10));
  const y0 = num(at(20));
  const x1 = num(at(11));
  const y1 = num(at(21));
  acc.paths.push([x0, y0, x1, y1]);
  acc.bounds.addPoint(x0, y0);
  acc.bounds.addPoint(x1, y1);
  acc.length += Math.hypot(x1 - x0, y1 - y0);
  acc.count += 1;
}

function readCircle(tags: Tag[], acc: Accumulator): void {
  const at = (code: number) => tags.find((t) => t.code === code);
  const r = num(at(40));
  if (r <= 0) return;
  const cx = num(at(10));
  const cy = num(at(20));
  acc.paths.push(arcPoints(cx, cy, r, 0, Math.PI * 2));
  acc.bounds.addArc(cx, cy, r, 0, Math.PI * 2);
  acc.length += 2 * Math.PI * r;
  acc.count += 1;
}

function readArc(tags: Tag[], acc: Accumulator): void {
  const at = (code: number) => tags.find((t) => t.code === code);
  const r = num(at(40));
  if (r <= 0) return;
  const startDeg = num(at(50));
  const endDeg = num(at(51));
  // DXF arcs always run counter-clockwise from start to end angle.
  let sweepDeg = endDeg - startDeg;
  while (sweepDeg <= 0) sweepDeg += 360;
  const sweepRad = (sweepDeg * Math.PI) / 180;
  const cx = num(at(10));
  const cy = num(at(20));
  const startRad = (startDeg * Math.PI) / 180;
  acc.paths.push(arcPoints(cx, cy, r, startRad, sweepRad));
  acc.bounds.addArc(cx, cy, r, startRad, sweepRad);
  acc.length += r * sweepRad;
  acc.count += 1;
}

interface Vertex {
  x: number;
  y: number;
  bulge: number;
}

/** Walks a vertex ring (open or closed), expanding bulges, into one path + its length. */
function buildVertexPath(vertices: Vertex[], closed: boolean, acc: Accumulator): void {
  if (vertices.length < 2) return;
  const path: FlatPath = [vertices[0].x, vertices[0].y];
  let length = 0;
  const last = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < last; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (a.bulge !== 0) {
      const arc = bulgeArc(a.x, a.y, b.x, b.y, a.bulge);
      path.push(...arc.points);
      length += arc.length;
      if (arc.arc) acc.bounds.addArc(arc.arc.cx, arc.arc.cy, arc.arc.r, arc.arc.start, arc.arc.sweep);
      else acc.bounds.addPoint(b.x, b.y);
    } else {
      path.push(b.x, b.y);
      length += Math.hypot(b.x - a.x, b.y - a.y);
    }
    // BOTH endpoints are bounded, not just the segment start. On a CLOSED ring every
    // vertex eventually appears as `a`, but an OPEN profile's final vertex never does
    // — omitting it silently truncated the bounding box (a part drawn as an open
    // profile measured 0 mm tall and was then rejected as having "no measurable
    // area", or under-nested and under-priced).
    acc.bounds.addPoint(a.x, a.y);
    acc.bounds.addPoint(b.x, b.y);
  }
  acc.paths.push(path);
  acc.length += length;
  acc.count += 1;
}

function readLwPolyline(tags: Tag[], acc: Accumulator): void {
  const closed = (num(tags.find((t) => t.code === 70)) & 1) === 1;
  const vertices: Vertex[] = [];
  for (const tag of tags) {
    if (tag.code === 10) vertices.push({ x: num(tag), y: 0, bulge: 0 });
    else if (tag.code === 20 && vertices.length) vertices[vertices.length - 1].y = num(tag);
    else if (tag.code === 42 && vertices.length) vertices[vertices.length - 1].bulge = num(tag);
  }
  buildVertexPath(vertices, closed, acc);
}

/** Old-style POLYLINE: a header entity followed by VERTEX entities up to SEQEND. */
function readPolyline(header: Tag[], vertexBlocks: Tag[][], acc: Accumulator): void {
  const closed = (num(header.find((t) => t.code === 70)) & 1) === 1;
  const vertices: Vertex[] = vertexBlocks.map((block) => ({
    x: num(block.find((t) => t.code === 10)),
    y: num(block.find((t) => t.code === 20)),
    bulge: num(block.find((t) => t.code === 42)),
  }));
  buildVertexPath(vertices, closed, acc);
}

/**
 * Parses an ASCII DXF into canvas-ready geometry and a priceable cut length.
 *
 * Only modelspace ENTITIES are read. Unsupported entity types are skipped silently
 * (a drawing may legitimately carry dimensions or text); a file with ZERO supported
 * entities is a hard 422, because a quote priced on nothing would be meaningless.
 * Output paths are translated so the bounding box starts at (0, 0), which is the
 * origin convention the nesting engine and the work-bed canvas both assume.
 */
export function parseDxf(buffer: Buffer): ParsedGeometry {
  const text = buffer.toString('utf8');
  if (!/\bSECTION\b/.test(text) || !/\b(ENTITIES|EOF)\b/.test(text)) {
    throw new DxfParseError(
      'Could not parse the drawing: the file does not contain a DXF SECTION header. Export it as an ASCII DXF and try again.',
    );
  }

  const tags = tokenize(text);
  const acc: Accumulator = { paths: [], length: 0, count: 0, bounds: new Bounds() };

  // Split the tag stream on group code 0 (entity boundary) into typed blocks.
  const blocks: { type: string; tags: Tag[] }[] = [];
  let current: { type: string; tags: Tag[] } | null = null;
  for (const tag of tags) {
    if (tag.code === 0) {
      if (current) blocks.push(current);
      current = { type: tag.value.trim().toUpperCase(), tags: [] };
    } else if (current) {
      current.tags.push(tag);
    }
  }
  if (current) blocks.push(current);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!SUPPORTED.has(block.type)) continue;
    switch (block.type) {
      case 'LINE':
        readLine(block.tags, acc);
        break;
      case 'CIRCLE':
        readCircle(block.tags, acc);
        break;
      case 'ARC':
        readArc(block.tags, acc);
        break;
      case 'LWPOLYLINE':
        readLwPolyline(block.tags, acc);
        break;
      case 'POLYLINE': {
        const vertexBlocks: Tag[][] = [];
        let j = i + 1;
        while (j < blocks.length && blocks[j].type === 'VERTEX') {
          vertexBlocks.push(blocks[j].tags);
          j++;
        }
        readPolyline(block.tags, vertexBlocks, acc);
        i = j; // skip the consumed VERTEX/SEQEND run
        break;
      }
    }
  }

  if (acc.count === 0 || acc.paths.length === 0) {
    throw new DxfParseError(
      'Could not parse the drawing: no supported entities were found. The drawing must contain LINE, ARC, CIRCLE, LWPOLYLINE or POLYLINE geometry.',
    );
  }

  const { minX, minY, maxX, maxY } = acc.bounds;
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    throw new DxfParseError('Could not parse the drawing: its geometry has no finite coordinates.');
  }

  const paths = acc.paths.map((path) =>
    path.map((value, index) => (index % 2 === 0 ? value - minX : value - minY)),
  );

  return {
    paths,
    cutLengthMm: acc.length,
    bboxWMm: maxX - minX,
    bboxHMm: maxY - minY,
    entityCount: acc.count,
  };
}

export { polylineLength };
