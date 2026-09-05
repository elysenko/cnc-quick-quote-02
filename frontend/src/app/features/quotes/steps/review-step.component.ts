import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { money } from '../../../core/format';
import { QuoteApi } from '../../../core/api/domain.service';
import { WorkbedCanvasComponent } from '../../../shared/workbed/workbed-canvas.component';
import { QuoteDraftService, nest, priceQuote, readWizardParams } from '../wizard';

@Component({
  selector: 'app-review-step',
  imports: [WorkbedCanvasComponent, RouterLink],
  templateUrl: './review-step.component.html',
  styleUrl: './steps.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewStepComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly draft = inject(QuoteDraftService);
  private readonly quoteApi = inject(QuoteApi);

  readonly money = money;
  readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: null });
  readonly params = computed(() => readWizardParams(this.queryParams()));
  readonly bends = this.draft.bends;
  readonly issuing = signal(false);
  readonly error = signal<string | null>(null);
  readonly sheetIndex = signal(1);

  constructor() {
    void this.draft.ensureLoaded();
    effect(() => {
      const drawingId = this.params().drawingId;
      if (drawingId) void this.draft.loadBends(drawingId);
    });
  }

  /** True when the URL is missing part of the selection — the template explains it. */
  readonly assumed = computed(() => !this.params().drawingId || !this.params().materialId);
  readonly drawing = computed(() => this.draft.drawing(this.params().drawingId));
  readonly material = computed(() => this.draft.material(this.params().materialId));
  readonly quantity = computed(() => this.params().qty);

  readonly nested = computed(() => {
    const drawing = this.drawing();
    const material = this.material();
    const machine = this.draft.machine();
    if (!drawing || !material) return null;
    return nest(
      drawing.bboxWMm,
      drawing.bboxHMm,
      this.quantity(),
      material.sheetWidthMm,
      material.sheetHeightMm,
      machine.sheetSpacingMm,
      machine.sheetMarginMm,
    );
  });

  readonly priced = computed(() => {
    const drawing = this.drawing();
    const material = this.material();
    const nested = this.nested();
    if (!drawing || !material || !nested) return null;
    return priceQuote(
      drawing.cutLengthMm * this.quantity(),
      nested.sheets,
      this.bends().length,
      material.costMultiplier,
      this.draft.pricing(),
    );
  });

  readonly sheetNumbers = computed(() =>
    Array.from({ length: this.nested()?.sheets ?? 0 }, (_, i) => i + 1),
  );

  showSheet(index: number): void {
    this.sheetIndex.set(index);
  }

  /**
   * Preview-only affordance kept because the approved template references it. The
   * real 429 (with the server's own Retry-After seconds) surfaces through issue().
   */
  simulateRateLimit(): void {
    if (!COLOSSUS_PREVIEW) return;
    this.error.set('Too many quotes in a short time. Please try again in 42 seconds.');
  }

  /**
   * Issues the quote server-side and navigates to it. The server recomputes nesting
   * and pricing from its own settings and freezes a pricing snapshot on the row —
   * the estimate shown above is a preview, this response is the binding number.
   */
  async issue(): Promise<void> {
    const { drawingId, materialId, qty } = this.params();
    if (!drawingId || !materialId || qty < 1) {
      this.error.set('Choose a drawing, a material and a quantity before issuing this quote.');
      return;
    }
    this.error.set(null);
    this.issuing.set(true);
    try {
      const quote = await this.quoteApi.create(drawingId, materialId, qty);
      await this.router.navigate(['/quotes', quote.id]);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.issuing.set(false);
    }
  }
}
