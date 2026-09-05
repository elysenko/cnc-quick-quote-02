/**
 * Laser cut-path animation driver.
 *
 * The ordered cut path is tessellated into a flat point array ONCE (buildLaserPath)
 * and the rAF loop only walks the pre-computed cumulative-length table, which is what
 * keeps large parts at frame rate. Nothing here touches the DOM — the canvas component
 * owns rendering and simply asks for the state at the current arc-length.
 */
import type { FlatPath } from './geometry';

export interface LaserPath {
  /** Ordered, already-tessellated loops. */
  paths: FlatPath[];
  /** cum[p][i] = arc length from the start of loop p to its vertex i. */
  cum: number[][];
  /** Arc length at which each loop starts, in traversal order. */
  starts: number[];
  total: number;
}

export function buildLaserPath(paths: FlatPath[]): LaserPath {
  const cum: number[][] = [];
  const starts: number[] = [];
  let total = 0;
  for (const path of paths) {
    starts.push(total);
    const table = [0];
    for (let i = 2; i < path.length; i += 2) {
      table.push(table[table.length - 1] + Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]));
    }
    cum.push(table);
    total += table[table.length - 1] ?? 0;
  }
  return { paths, cum, starts, total };
}

export interface LaserState {
  /** Fully cut loops plus the partially cut leading loop. */
  cut: FlatPath[];
  /** Current laser-head position in drawing units, or null before the first vertex. */
  head: [number, number] | null;
  progress: number;
}

/** Geometry of the cut so far at `distance` mm along the ordered path. */
export function stateAt(lp: LaserPath, distance: number): LaserState {
  const cut: FlatPath[] = [];
  let head: [number, number] | null = null;
  for (let p = 0; p < lp.paths.length; p++) {
    const local = distance - lp.starts[p];
    const table = lp.cum[p];
    const path = lp.paths[p];
    const loopLength = table[table.length - 1] ?? 0;
    if (local <= 0) continue;
    if (local >= loopLength) {
      cut.push(path);
      head = [path[path.length - 2], path[path.length - 1]];
      continue;
    }
    const partial: FlatPath = [path[0], path[1]];
    for (let i = 1; i < table.length; i++) {
      if (table[i] <= local) {
        partial.push(path[i * 2], path[i * 2 + 1]);
        continue;
      }
      const span = table[i] - table[i - 1] || 1;
      const t = (local - table[i - 1]) / span;
      const x = path[(i - 1) * 2] + (path[i * 2] - path[(i - 1) * 2]) * t;
      const y = path[(i - 1) * 2 + 1] + (path[i * 2 + 1] - path[(i - 1) * 2 + 1]) * t;
      partial.push(x, y);
      head = [x, y];
      break;
    }
    cut.push(partial);
    break;
  }
  return { cut, head, progress: lp.total > 0 ? Math.min(1, distance / lp.total) : 1 };
}

/** requestAnimationFrame driver. `stop()` resets to frame 0 per the Print Bed contract. */
export class LaserRunner {
  private handle = 0;
  private last = 0;
  private distance = 0;
  private active = false;

  /** @param speed drawing units per second, scaled by the machine animation speed. */
  constructor(
    private readonly total: number,
    private readonly speed: number,
    private readonly onFrame: (distance: number) => void,
  ) {}

  get running(): boolean {
    return this.active;
  }

  start(): void {
    if (this.active || this.total <= 0) return;
    this.active = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.active) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.distance += this.speed * dt;
      if (this.distance >= this.total) this.distance = 0; // loop the cut cycle
      this.onFrame(this.distance);
      this.handle = requestAnimationFrame(tick);
    };
    this.handle = requestAnimationFrame(tick);
  }

  /** Stops the loop and rewinds to frame 0. */
  stop(): void {
    this.active = false;
    if (this.handle) cancelAnimationFrame(this.handle);
    this.handle = 0;
    this.distance = 0;
    this.onFrame(0);
  }

  /** Cancels the rAF handle without emitting a further frame (ngOnDestroy). */
  destroy(): void {
    this.active = false;
    if (this.handle) cancelAnimationFrame(this.handle);
    this.handle = 0;
  }
}
