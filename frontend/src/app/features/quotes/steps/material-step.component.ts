import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { Material } from '../../../core/models';
import { money } from '../../../core/format';
import { QuoteDraftService, nest, priceQuote, readWizardParams } from '../wizard';

@Component({
  selector: 'app-material-step',
  templateUrl: './material-step.component.html',
  styleUrl: './steps.css',
  // Preview-only affordance in the design-owned template — hidden, not removed.
  styles: [':host(.hide-preview-tools) .preview-tool { display: none; }'],
  host: { '[class.hide-preview-tools]': '!isPreview' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialStepComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly draft = inject(QuoteDraftService);

  readonly isPreview = COLOSSUS_PREVIEW;
  readonly money = money;
  readonly materials = this.draft.activeMaterials;
  readonly pricing = this.draft.pricing;
  readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: null });
  readonly params = computed(() => readWizardParams(this.queryParams()));
  readonly serverError = signal<string | null>(null);

  readonly drawing = computed(() => this.draft.drawing(this.params().drawingId));

  constructor() {
    void this.draft.ensureLoaded();
  }
  readonly material = computed(() => this.materials().find((m) => m.id === this.params().materialId) ?? null);

  readonly quantityError = computed(() => {
    const { qty } = this.params();
    const cfg = this.pricing();
    if (qty === 0) return `Enter a quantity of at least ${cfg.qtyMin}.`;
    if (qty > cfg.qtyMax) return `Quantity must be ${cfg.qtyMax} or fewer per quote.`;
    return null;
  });

  readonly estimate = computed(() => {
    const drawing = this.drawing();
    const material = this.material();
    const { qty } = this.params();
    if (!drawing || !material || qty < 1 || this.quantityError()) return null;
    const machine = this.draft.machine();
    const nested = nest(
      drawing.bboxWMm,
      drawing.bboxHMm,
      qty,
      material.sheetWidthMm,
      material.sheetHeightMm,
      machine.sheetSpacingMm,
      machine.sheetMarginMm,
    );
    const priced = priceQuote(
      drawing.cutLengthMm * qty,
      nested.sheets,
      this.draft.bends().length,
      material.costMultiplier,
      this.pricing(),
    );
    return { ...nested, ...priced };
  });

  pick(material: Material): void {
    this.serverError.set(null);
    this.patch({ materialId: material.id });
  }

  onQuantity(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patch({ qty: value });
  }

  setQuantity(qty: number): void {
    this.patch({ qty: String(qty) });
  }

  /**
   * Preview-only affordance kept because the approved template references it. In a
   * production build it does nothing — a genuinely deactivated material is rejected
   * by the server with this same message when the quote is issued.
   */
  simulateDeactivated(): void {
    if (!COLOSSUS_PREVIEW) return;
    this.serverError.set(
      'That material was deactivated by the workshop while you were quoting. Choose another material to continue.',
    );
  }

  private patch(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }
}
