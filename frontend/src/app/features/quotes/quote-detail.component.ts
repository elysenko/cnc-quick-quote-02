import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { BendLine, Drawing, Material, Quote } from '../../core/models';
import { money } from '../../core/format';
import { DrawingApi, MaterialApi, QuoteApi } from '../../core/api/domain.service';
import { WorkbedCanvasComponent } from '../../shared/workbed/workbed-canvas.component';

@Component({
  selector: 'app-quote-detail',
  imports: [WorkbedCanvasComponent, RouterLink, SlicePipe],
  templateUrl: './quote-detail.component.html',
  styleUrl: './quote-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly quoteApi = inject(QuoteApi);
  private readonly drawingApi = inject(DrawingApi);
  private readonly materialApi = inject(MaterialApi);
  private readonly bed = viewChild(WorkbedCanvasComponent);

  readonly money = money;
  readonly quotes = signal<Quote[]>([]);
  readonly drawings = signal<Drawing[]>([]);
  /** Bend lines belonging to THIS quote's drawing, loaded from the server. */
  readonly bends = signal<BendLine[]>([]);
  readonly sheetIndex = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly routeParams = toSignal(this.route.paramMap, { initialValue: null });
  readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly quote = signal<Quote | null>(null);
  readonly drawing = signal<Drawing | null>(null);
  readonly material = signal<Material | null>(null);

  constructor() {
    // Re-runs on every :id change, so navigating between quotes refetches rather
    // than showing the previous quote's geometry.
    effect(() => {
      const id = this.routeParams()?.get('id');
      if (id) void this.load(id);
    });
  }

  /**
   * Loads the quote, then its drawing geometry, bend lines and material in parallel.
   * The secondary fetches are individually tolerant: the page still renders the
   * quote and its price if, say, the drawing geometry is unavailable.
   */
  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const quote = await this.quoteApi.get(id);
      this.quote.set(quote);
      this.quotes.set([quote]);
      const [drawing, bends, materials] = await Promise.all([
        this.drawingApi.get(quote.drawingId).catch(() => null),
        this.drawingApi.bends(quote.drawingId).catch(() => [] as BendLine[]),
        this.materialApi.list().catch(() => [] as Material[]),
      ]);
      this.drawing.set(drawing);
      this.drawings.set(drawing ? [drawing] : []);
      this.bends.set(bends);
      this.material.set(materials.find((m) => m.id === quote.materialId) ?? null);
    } catch (error) {
      this.quote.set(null);
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  readonly panel = computed(() => this.queryParams()?.get('panel') ?? '');
  readonly modal = computed(() => this.queryParams()?.get('modal') ?? '');
  readonly sheetNumbers = computed(() =>
    Array.from({ length: this.quote()?.sheetCount ?? 0 }, (_, i) => i + 1),
  );
  readonly running = computed(() => this.bed()?.running() ?? false);

  togglePanel(): void {
    this.setQuery({ panel: this.panel() === 'breakdown' ? null : 'breakdown' });
  }

  openModal(name: string): void {
    this.setQuery({ modal: name });
  }

  closeModal(): void {
    this.setQuery({ modal: null });
  }

  showSheet(index: number): void {
    this.sheetIndex.set(index);
  }

  /** Print Bed: running → stop and reset to frame 0; stopped → start again. */
  togglePrintBed(): void {
    this.bed()?.toggle();
  }

  private setQuery(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  goCheckout(): void {
    const quote = this.quote();
    if (quote) void this.router.navigate(['/checkout', quote.id, 'review']);
  }
}
