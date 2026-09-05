import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Quote } from '../../core/models';
import { MOCK_DRAWINGS, MOCK_QUOTES, money } from '../../core/mock/fixtures';
import { WorkbedCanvasComponent } from '../../shared/workbed/workbed-canvas.component';
import { QuoteDraftService } from './wizard';

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
  private readonly draft = inject(QuoteDraftService);
  private readonly bed = viewChild(WorkbedCanvasComponent);

  readonly money = money;
  // MOCK DATA — replace initializer with [] and load via API
  readonly quotes = signal<Quote[]>(MOCK_QUOTES);
  readonly drawings = signal(MOCK_DRAWINGS);
  readonly bends = this.draft.bends;
  readonly sheetIndex = signal(1);

  readonly routeParams = toSignal(this.route.paramMap, { initialValue: null });
  readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly quote = computed(() => {
    const id = this.routeParams()?.get('id');
    return this.quotes().find((q) => q.id === id) ?? null;
  });

  readonly drawing = computed(() => {
    const quote = this.quote();
    return quote ? (this.drawings().find((d) => d.id === quote.drawingId) ?? null) : null;
  });

  readonly material = computed(() =>
    this.draft.materials().find((m) => m.id === this.quote()?.materialId) ?? null,
  );

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
