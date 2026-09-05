import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { BendLine } from '../../core/models';
import { FlatPath, boundsOf, fitTransform } from '../workbed/geometry';

export interface DraftBend {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/**
 * Bend Mode overlay drawn on top of the parsed part geometry.
 * Click-drag creates a bend line; clicking an existing bend selects it; dragging a
 * selected bend moves it. All mutations are emitted upwards — this component owns
 * no bend state so the list and the canvas always render from the same source.
 */
@Component({
  selector: 'app-bend-editor-canvas',
  templateUrl: './bend-editor-canvas.component.html',
  styleUrl: './bend-editor-canvas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BendEditorCanvasComponent implements AfterViewInit, OnDestroy {
  readonly paths = input<FlatPath[]>([]);
  readonly bends = input<BendLine[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly bendMode = input(true);

  readonly bendDrawn = output<DraftBend>();
  readonly bendSelected = output<string | null>();
  readonly bendMoved = output<{ id: string; dx: number; dy: number }>();

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('cv');
  private observer?: ResizeObserver;
  private viewW = 0;
  private viewH = 0;
  private dragStart: { x: number; y: number } | null = null;
  private movingId: string | null = null;
  private lastPoint: { x: number; y: number } | null = null;

  readonly draft = signal<DraftBend | null>(null);
  readonly hint = signal('Drag across the part to place a bend line.');

  private readonly bounds = computed(() => boundsOf(this.paths()));

  constructor() {
    effect(() => {
      this.paths();
      this.bends();
      this.selectedId();
      this.draft();
      this.draw();
    });
  }

  ngAfterViewInit(): void {
    const host = this.canvasRef()?.nativeElement.parentElement;
    this.observer = new ResizeObserver(() => this.resize());
    if (host) this.observer.observe(host);
    this.resize();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  onPointerDown(event: PointerEvent): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    const point = this.toDrawing(event);
    const hit = this.hitTest(point);
    if (hit) {
      this.bendSelected.emit(hit.id);
      this.movingId = hit.id;
      this.lastPoint = point;
      this.hint.set('Drag to reposition, or use the angle and direction controls.');
      return;
    }
    if (!this.bendMode()) {
      this.bendSelected.emit(null);
      return;
    }
    this.dragStart = point;
    this.draft.set({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
  }

  onPointerMove(event: PointerEvent): void {
    const point = this.toDrawing(event);
    if (this.movingId && this.lastPoint) {
      this.bendMoved.emit({
        id: this.movingId,
        dx: point.x - this.lastPoint.x,
        dy: point.y - this.lastPoint.y,
      });
      this.lastPoint = point;
      return;
    }
    if (!this.dragStart) return;
    this.draft.set({
      startX: this.dragStart.x,
      startY: this.dragStart.y,
      endX: point.x,
      endY: point.y,
    });
  }

  onPointerUp(): void {
    this.movingId = null;
    this.lastPoint = null;
    const draft = this.draft();
    this.dragStart = null;
    this.draft.set(null);
    if (!draft) return;
    const length = Math.hypot(draft.endX - draft.startX, draft.endY - draft.startY);
    if (length < 2) {
      this.hint.set('That was a click, not a drag — no bend was created.');
      return;
    }
    this.hint.set('Bend line placed. Set the angle and direction, then save it.');
    this.bendDrawn.emit(draft);
  }

  private hitTest(point: { x: number; y: number }): BendLine | null {
    const tolerance = (this.bounds().maxX - this.bounds().minX) * 0.04 + 2;
    for (const bend of this.bends()) {
      const dx = bend.endX - bend.startX;
      const dy = bend.endY - bend.startY;
      const lengthSq = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((point.x - bend.startX) * dx + (point.y - bend.startY) * dy) / lengthSq));
      const distance = Math.hypot(point.x - (bend.startX + dx * t), point.y - (bend.startY + dy * t));
      if (distance <= tolerance) return bend;
    }
    return null;
  }

  private transform() {
    const b = this.bounds();
    const w = Math.max(1, b.maxX - b.minX);
    const h = Math.max(1, b.maxY - b.minY);
    const fit = fitTransform(w, h, this.viewW, this.viewH, 34);
    return { fit, b, w, h };
  }

  private toDrawing(event: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { fit, b } = this.transform();
    return {
      x: (event.clientX - rect.left - fit.offsetX) / fit.scale + b.minX,
      y: (event.clientY - rect.top - fit.offsetY) / fit.scale + b.minY,
    };
  }

  private resize(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = host.getBoundingClientRect();
    this.viewW = Math.max(200, rect.width);
    this.viewH = Math.max(200, rect.height);
    canvas.width = Math.round(this.viewW * dpr);
    canvas.height = Math.round(this.viewH * dpr);
    canvas.style.width = `${this.viewW}px`;
    canvas.style.height = `${this.viewH}px`;
    this.draw();
  }

  private token(name: string, fallback: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  private draw(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.viewW) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    const { fit, b } = this.transform();
    const toX = (x: number) => fit.offsetX + (x - b.minX) * fit.scale;
    const toY = (y: number) => fit.offsetY + (y - b.minY) * fit.scale;

    ctx.fillStyle = this.token('--bed', '#0f172a');
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.strokeStyle = this.token('--cut', '#2563eb');
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (const path of this.paths()) {
      if (path.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(toX(path[0]), toY(path[1]));
      for (let i = 2; i < path.length; i += 2) ctx.lineTo(toX(path[i]), toY(path[i + 1]));
      ctx.stroke();
    }

    const bendColor = this.token('--bend', '#f97316');
    for (const bend of this.bends()) {
      const selected = bend.id === this.selectedId();
      ctx.strokeStyle = bendColor;
      ctx.lineWidth = selected ? 3.5 : 2;
      ctx.setLineDash([9, 6]);
      ctx.beginPath();
      ctx.moveTo(toX(bend.startX), toY(bend.startY));
      ctx.lineTo(toX(bend.endX), toY(bend.endY));
      ctx.stroke();
      ctx.setLineDash([]);
      if (selected) {
        ctx.fillStyle = bendColor;
        for (const [hx, hy] of [
          [bend.startX, bend.startY],
          [bend.endX, bend.endY],
        ]) {
          ctx.beginPath();
          ctx.arc(toX(hx), toY(hy), 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = this.token('--sheet', '#cbd5e1');
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(
        `${bend.angleDeg}° ${bend.direction}`,
        toX((bend.startX + bend.endX) / 2) + 8,
        toY((bend.startY + bend.endY) / 2) - 8,
      );
    }

    const draft = this.draft();
    if (draft) {
      ctx.strokeStyle = this.token('--laser', '#f43f5e');
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(toX(draft.startX), toY(draft.startY));
      ctx.lineTo(toX(draft.endX), toY(draft.endY));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
