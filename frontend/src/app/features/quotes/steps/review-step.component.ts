import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { money } from '../../../core/mock/fixtures';
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

  readonly money = money;
  readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: null });
  readonly params = computed(() => readWizardParams(this.queryParams()));
  readonly bends = this.draft.bends;
  readonly issuing = signal(false);
  readonly error = signal<string | null>(null);
  readonly sheetIndex = signal(1);

  /** A deep link without a full selection still renders, using the account's latest drawing. */
  readonly assumed = computed(() => !this.params().drawingId || !this.params().materialId);
  readonly drawing = computed(() => this.draft.drawing(this.params().drawingId));
  readonly material = computed(
    () => this.draft.material(this.params().materialId) ?? this.draft.activeMaterials()[0],
  );
  readonly quantity = computed(() => this.params().qty || 10);

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

  simulateRateLimit(): void {
    this.error.set('Too many quotes in a short time. Please try again in 42 seconds.');
  }

  issue(): void {
    this.error.set(null);
    this.issuing.set(true);
    setTimeout(() => {
      this.issuing.set(false);
      void this.router.navigate(['/quotes', 'q_1042']);
    }, 500);
  }
}
