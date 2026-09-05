import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MOCK_PRICING, money } from '../../core/mock/fixtures';
import type { BreakdownLine, PricingSettings } from '../../core/models';

const MM_PER_FOOT = 304.8;
/** Worked example: 10 mount brackets, 400 mm of cut path each, one bend, one sheet. */
const EXAMPLE = { qty: 10, cutLengthMm: 4000, sheets: 1, bends: 1, multiplier: 1 };

/** Pricing engine settings. Money is entered in dollars and stored as integer cents. */
@Component({
  selector: 'app-admin-pricing',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-pricing.component.html',
  styleUrl: './admin-pricing.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPricingComponent {
  private readonly fb = inject(FormBuilder);

  // MOCK DATA — replace initializer with [] and load via API
  readonly pricing = signal<PricingSettings>(MOCK_PRICING);

  readonly saved = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly money = money;
  readonly example = EXAMPLE;

  readonly form = this.fb.nonNullable.group({
    setupFee: [this.toDollars(MOCK_PRICING.setupFeeCents), [Validators.required, Validators.min(0)]],
    costPerLinearFoot: [this.toDollars(MOCK_PRICING.costPerLinearFootCents), [Validators.required, Validators.min(0)]],
    perSheetCost: [this.toDollars(MOCK_PRICING.perSheetCostCents), [Validators.required, Validators.min(0)]],
    handlingFee: [this.toDollars(MOCK_PRICING.handlingFeeCents), [Validators.required, Validators.min(0)]],
    costPerBend: [this.toDollars(MOCK_PRICING.costPerBendCents), [Validators.required, Validators.min(0)]],
    minimumOrder: [this.toDollars(MOCK_PRICING.minimumOrderCents), [Validators.required, Validators.min(0)]],
    qtyMin: [MOCK_PRICING.qtyMin, [Validators.required, Validators.min(1)]],
    qtyMax: [MOCK_PRICING.qtyMax, [Validators.required, Validators.min(1)]],
  });

  /** Mirrors the form so the worked example recalculates on every keystroke. */
  readonly draft = signal(this.form.getRawValue());

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.draft.set(this.form.getRawValue()));
  }

  private toDollars(cents: number): number {
    return Math.round(cents) / 100;
  }

  cents(dollars: number): number {
    return Math.round((Number.isFinite(dollars) ? dollars : 0) * 100);
  }

  /** Live per-field "= $50.00" hint. */
  hint(dollars: number): string {
    return money(this.cents(dollars));
  }

  readonly draftCents = computed<PricingSettings>(() => {
    const d = this.draft();
    return {
      setupFeeCents: this.cents(d.setupFee),
      costPerLinearFootCents: this.cents(d.costPerLinearFoot),
      perSheetCostCents: this.cents(d.perSheetCost),
      handlingFeeCents: this.cents(d.handlingFee),
      costPerBendCents: this.cents(d.costPerBend),
      minimumOrderCents: this.cents(d.minimumOrder),
      qtyMin: d.qtyMin,
      qtyMax: d.qtyMax,
    };
  });

  readonly exampleFeet = EXAMPLE.cutLengthMm / MM_PER_FOOT;

  readonly exampleLines = computed<BreakdownLine[]>(() => {
    const p = this.draftCents();
    const feet = this.exampleFeet;
    return [
      { label: 'Setup fee', detail: 'Per job, charged once', amountCents: p.setupFeeCents },
      {
        label: 'Laser cutting',
        detail: `${feet.toFixed(2)} linear ft @ ${money(p.costPerLinearFootCents)}/ft`,
        amountCents: Math.round(feet * p.costPerLinearFootCents),
      },
      {
        label: 'Material sheets',
        detail: `${EXAMPLE.sheets} sheet @ ${money(p.perSheetCostCents)} × ${EXAMPLE.multiplier.toFixed(1)} multiplier`,
        amountCents: Math.round(EXAMPLE.sheets * p.perSheetCostCents * EXAMPLE.multiplier),
      },
      { label: 'Handling', detail: 'Deburr + pack', amountCents: p.handlingFeeCents },
      {
        label: 'Bending',
        detail: `${EXAMPLE.bends} bend @ ${money(p.costPerBendCents)}`,
        amountCents: EXAMPLE.bends * p.costPerBendCents,
      },
    ];
  });

  readonly exampleSubtotal = computed(() =>
    this.exampleLines().reduce((sum, line) => sum + line.amountCents, 0),
  );

  readonly minimumApplied = computed(
    () => this.exampleSubtotal() < this.draftCents().minimumOrderCents,
  );

  readonly exampleTotal = computed(() =>
    Math.max(this.exampleSubtotal(), this.draftCents().minimumOrderCents),
  );

  readonly examplePerPart = computed(() => Math.round(this.exampleTotal() / EXAMPLE.qty));

  save(): void {
    this.saveError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Fix the highlighted fields before saving.');
      return;
    }
    const next = this.draftCents();
    if (next.qtyMax <= next.qtyMin) {
      this.saveError.set('Maximum quantity must be greater than the minimum quantity.');
      return;
    }
    this.pricing.set(next);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2600);
  }

  revert(): void {
    const p = this.pricing();
    this.saveError.set(null);
    this.form.reset({
      setupFee: this.toDollars(p.setupFeeCents),
      costPerLinearFoot: this.toDollars(p.costPerLinearFootCents),
      perSheetCost: this.toDollars(p.perSheetCostCents),
      handlingFee: this.toDollars(p.handlingFeeCents),
      costPerBend: this.toDollars(p.costPerBendCents),
      minimumOrder: this.toDollars(p.minimumOrderCents),
      qtyMin: p.qtyMin,
      qtyMax: p.qtyMax,
    });
  }
}
