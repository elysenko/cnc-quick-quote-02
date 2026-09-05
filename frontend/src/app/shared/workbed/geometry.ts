/**
 * Geometry helpers for the work bed canvas and the laser animation.
 *
 * A "path" is a flat point array [x0, y0, x1, y1, ...] in drawing units (mm).
 * Curves are tessellated ONCE here — never per animation frame — so the rAF loop
 * only walks a pre-computed array (see laser-animation.ts).
 */

export type FlatPath = number[];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Closed rectangle path. */
export function rectPath(x: number, y: number, w: number, h: number): FlatPath {
  return [x, y, x + w, y, x + w, y + h, x, y + h, x, y];
}

/** Circle tessellated into `segments` chords. */
export function circlePath(cx: number, cy: number, r: number, segments = 48): FlatPath {
  const out: FlatPath = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

/** Rounded rectangle, corners tessellated as quarter arcs. */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): FlatPath {
  const out: FlatPath = [];
  const corner = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= 8; i++) {
      const a = from + (i / 8) * (Math.PI / 2);
      out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };
  out.push(x + r, y);
  out.push(x + w - r, y);
  corner(x + w - r, y + r, -Math.PI / 2);
  out.push(x + w, y + h - r);
  corner(x + w - r, y + h - r, 0);
  out.push(x + r, y + h);
  corner(x + r, y + h - r, Math.PI / 2);
  out.push(x, y + r);
  corner(x + r, y + r, Math.PI);
  return out;
}

/** Total polyline length in drawing units. */
export function pathLength(path: FlatPath): number {
  let total = 0;
  for (let i = 2; i < path.length; i += 2) {
    total += Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
  }
  return total;
}

export function totalLength(paths: FlatPath[]): number {
  return paths.reduce((sum, p) => sum + pathLength(p), 0);
}

export function boundsOf(paths: FlatPath[]): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const path of paths) {
    for (let i = 0; i < path.length; i += 2) {
      b.minX = Math.min(b.minX, path[i]);
      b.maxX = Math.max(b.maxX, path[i]);
      b.minY = Math.min(b.minY, path[i + 1]);
      b.maxY = Math.max(b.maxY, path[i + 1]);
    }
  }
  if (!isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return b;
}

/** Uniform fit-to-viewport transform (preserves aspect ratio, never clips). */
export interface FitTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function fitTransform(
  contentW: number,
  contentH: number,
  viewW: number,
  viewH: number,
  padding = 16,
): FitTransform {
  const availW = Math.max(1, viewW - padding * 2);
  const availH = Math.max(1, viewH - padding * 2);
  const scale = Math.min(availW / Math.max(contentW, 1e-6), availH / Math.max(contentH, 1e-6));
  return {
    scale,
    offsetX: padding + (availW - contentW * scale) / 2,
    offsetY: padding + (availH - contentH * scale) / 2,
  };
}

/** Reference part outlines used by the mockup fixtures (mm, top-left origin). */
export function bracketPaths(w = 100, h = 100): FlatPath[] {
  return [
    roundedRectPath(0, 0, w, h, Math.min(w, h) * 0.12),
    circlePath(w * 0.25, h * 0.25, Math.min(w, h) * 0.09),
    circlePath(w * 0.75, h * 0.25, Math.min(w, h) * 0.09),
    circlePath(w * 0.5, h * 0.68, Math.min(w, h) * 0.16),
  ];
}

export function flangePaths(w = 180, h = 120): FlatPath[] {
  return [
    rectPath(0, 0, w, h),
    circlePath(w * 0.2, h * 0.5, 12),
    circlePath(w * 0.8, h * 0.5, 12),
    rectPath(w * 0.4, h * 0.2, w * 0.2, h * 0.6),
  ];
}
