import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { BendLine, Placement } from '../../core/models';
import { FlatPath, fitTransform } from './geometry';
import { LaserRunner, buildLaserPath, stateAt } from './laser-animation';

/**
 * Canvas 2D work bed: bed → sheet → nested placements → blue solid cut paths →
 * orange dashed bend lines → labels, with a laser head animated along the cut path.
 * The fit transform is uniform (aspect preserved) and recomputed in a ResizeObserver;
 * the backing store is devicePixelRatio-scaled so lines stay crisp.
 */
@Component({
  selector: 'app-workbed-canvas',
  templateUrl: './workbed-canvas.component.html',
  styleUrl: './workbed-canvas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkbedCanvasComponent implements AfterViewInit, OnDestroy {
  readonly paths = input<FlatPath[]>([]);
  readonly placements = input<Placement[]>([]);
  readonly bends = input<BendLine[]>([]);
  readonly sheetWidthMm = input(1220);
  readonly sheetHeightMm = input(2440);
  readonly sheetIndex = input(1);
  readonly animationSpeed = input(1);
  readonly autoStart = input(true);
  readonly compact = input(false);

  readonly running = signal(false);
  readonly progress = signal(0);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('cv');
  private observer?: ResizeObserver;
  private runner?: LaserRunner;
  private distance = 0;
  private viewW = 0;
  private viewH = 0;

  /** Part outlines translated onto every placement on the displayed sheet. */
  private readonly sheetPaths = computed<FlatPath[]>(() => {
    const base = this.paths();
    const out: FlatPath[] = [];
    for (const placement of this.placements().filter((p) => p.sheet === this.sheetIndex())) {
      for (const path of base) {
        const moved: FlatPath = new Array(path.length);
        for (let i = 0; i < path.length; i += 2) {
          moved[i] = path[i] + placement.x;
          moved[i + 1] = path[i + 1] + placement.y;
        }
        out.push(moved);
      }
    }
    return out;
  });

  private readonly laserPath = computed(() => buildLaserPath(this.sheetPaths()));

  constructor() {
    effect(() => {
      this.laserPath();
      this.bends();
      this.sheetWidthMm();
      this.draw();
    });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const host = canvas?.parentElement;
    this.observer = new ResizeObserver(() => this.resize());
    if (host) this.observer.observe(host);
    this.resize();
    if (this.autoStart()) this.start();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.runner?.destroy();
    this.runner = undefined;
  }

  /** Print Bed contract: running → stop AND reset to frame 0; stopped → start from 0. */
  toggle(): void {
    if (this.running()) this.stopAndReset();
    else this.start();
  }

  start(): void {
    if (this.running()) return;
    this.runner?.destroy();
    // Pace the head so one full cut cycle reads in roughly fifteen seconds, whatever
    // the job size, rather than crawling across a densely nested sheet.
    const total = this.laserPath().total;
    const speed = Math.max(160, total / 15) * this.animationSpeed();
    this.runner = new LaserRunner(total, speed, (d) => {
      this.distance = d;
      this.progressSet(d);
      this.draw();
    });
    this.running.set(true);
    this.runner.start();
  }

  stopAndReset(): void {
    this.runner?.stop();
    this.runner?.destroy();
    this.runner = undefined;
    this.running.set(false);
    this.distance = 0;
    this.progress.set(0);
    this.draw();
  }

  private progressSet(distance: number): void {
    const total = this.laserPath().total;
    this.progress.set(total > 0 ? distance / total : 0);
  }

  private resize(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = host.getBoundingClientRect();
    this.viewW = Math.max(200, rect.width);
    this.viewH = Math.max(160, rect.height);
    canvas.width = Math.round(this.viewW * dpr);
    canvas.height = Math.round(this.viewH * dpr);
    canvas.style.width = `${this.viewW}px`;
    canvas.style.height = `${this.viewH}px`;
    this.draw();
  }

  private token(name: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  private draw(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.viewW) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    const sheetW = this.sheetWidthMm();
    const sheetH = this.sheetHeightMm();
    const pad = Math.max(sheetW, sheetH) * 0.05;
    const bedW = sheetW + pad * 2;
    const bedH = sheetH + pad * 2;

    // A portrait sheet is shown the way it sits on the machine — long axis across the
    // bed — so the drawing fills a landscape viewport instead of a thin central strip.
    const rotate = bedH > bedW === this.viewW > this.viewH;
    const fit = fitTransform(
      rotate ? bedH : bedW,
      rotate ? bedW : bedH,
      this.viewW,
      this.viewH,
      this.compact() ? 10 : 20,
    );
    const s = fit.scale;
    // Drawing space is bed space: (0,0) is the sheet's top-left, pad is the bed margin.
    // Rotated: sheet X runs up the screen and sheet Y runs across it, so the sheet
    // origin sits bottom-left the way it does on the machine (a true rotation, never a
    // mirror — a mirrored part would be a manufacturing error).
    const matrix: [number, number, number, number, number, number] = rotate
      ? [0, -s, s, 0, fit.offsetX + s * pad, fit.offsetY + s * (bedW - pad)]
      : [s, 0, 0, s, fit.offsetX + s * pad, fit.offsetY + s * pad];
    const toScreen = (x: number, y: number): [number, number] => [
      matrix[0] * x + matrix[2] * y + matrix[4],
      matrix[1] * x + matrix[3] * y + matrix[5],
    ];
    const apply = () =>
      ctx.setTransform(
        matrix[0] * dpr,
        matrix[1] * dpr,
        matrix[2] * dpr,
        matrix[3] * dpr,
        matrix[4] * dpr,
        matrix[5] * dpr,
      );
    const px = (n: number) => n / s;

    apply();

    // Bed
    ctx.fillStyle = this.token('--bed', '#0f172a');
    ctx.fillRect(-pad, -pad, bedW, bedH);
    ctx.strokeStyle = this.token('--bed-grid', '#1e293b');
    ctx.lineWidth = px(1);
    ctx.beginPath();
    const step = 100;
    for (let x = 0; x <= sheetW; x += step) {
      ctx.moveTo(x, -pad);
      ctx.lineTo(x, sheetH + pad);
    }
    for (let y = 0; y <= sheetH; y += step) {
      ctx.moveTo(-pad, y);
      ctx.lineTo(sheetW + pad, y);
    }
    ctx.stroke();

    // Sheet
    ctx.fillStyle = this.token('--bed-grid', '#1e293b');
    ctx.fillRect(0, 0, sheetW, sheetH);
    ctx.strokeStyle = this.token('--sheet', '#cbd5e1');
    ctx.lineWidth = px(1.5);
    ctx.setLineDash([px(8), px(6)]);
    ctx.strokeRect(0, 0, sheetW, sheetH);
    ctx.setLineDash([]);

    const strokePaths = (paths: FlatPath[], color: string, width: number, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = px(width);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const path of paths) {
        if (path.length < 4) continue;
        ctx.beginPath();
        ctx.moveTo(path[0], path[1]);
        for (let i = 2; i < path.length; i += 2) ctx.lineTo(path[i], path[i + 1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    // Cut paths: remaining dim, cut-so-far bright blue solid
    const cutColor = this.token('--cut', '#2563eb');
    const all = this.sheetPaths();
    strokePaths(all, cutColor, 1.5, 0.32);
    const state = stateAt(this.laserPath(), this.distance);
    strokePaths(state.cut, cutColor, 2.25, 1);

    // Bend lines — orange dashed
    const placements = this.placements().filter((p) => p.sheet === this.sheetIndex());
    ctx.strokeStyle = this.token('--bend', '#f97316');
    ctx.lineWidth = px(1.5);
    ctx.setLineDash([px(9), px(7)]);
    ctx.globalAlpha = 0.9;
    for (const placement of placements) {
      for (const bend of this.bends()) {
        ctx.beginPath();
        ctx.moveTo(bend.startX + placement.x, bend.startY + placement.y);
        ctx.lineTo(bend.endX + placement.x, bend.endY + placement.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Laser head
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.head && this.running()) {
      const [hx, hy] = toScreen(state.head[0], state.head[1]);
      const laser = this.token('--laser', '#f43f5e');
      ctx.fillStyle = laser;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(hx, hy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Labels (drawn unrotated so they stay readable)
    if (this.compact()) return;
    ctx.fillStyle = this.token('--sheet', '#cbd5e1');
    ctx.font = '11px ui-monospace, monospace';
    ctx.globalAlpha = 0.85;
    const [lx, ly] = toScreen(0, 0);
    const [ex, ey] = toScreen(sheetW, sheetH);
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(`${sheetW} × ${sheetH} mm sheet`, Math.min(lx, ex), Math.min(ly, ey) - 7);
    ctx.textAlign = 'right';
    ctx.fillText(
      `Sheet ${this.sheetIndex()} · ${placements.length} part${placements.length === 1 ? '' : 's'} nested`,
      Math.max(lx, ex),
      Math.min(ly, ey) - 7,
    );
    ctx.globalAlpha = 1;
  }
}
