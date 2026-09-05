import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { BrandingService } from '../../core/branding.service';
import type { Order, Quote, ShippingMethod } from '../../core/models';
import { MOCK_ORDERS, MOCK_QUOTES, MOCK_SHIPPING_METHODS, money } from '../../core/mock/fixtures';

/**
 * Checkout step 2 — delivery method + address, then a hosted Stripe redirect.
 * Shipping cost is computed client-side from the method rate type and sheet count.
 */
@Component({
  selector: 'app-checkout-shipping',
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './checkout-shipping.component.html',
  styleUrl: './checkout-shipping.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutShippingComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly branding = inject(BrandingService);

  /** MOCK DATA — replace initializer with [] and load via API */
  readonly quotes = signal<Quote[]>(MOCK_QUOTES);
  /** MOCK DATA — replace initializer with [] and load via API */
  readonly methods = signal<ShippingMethod[]>(MOCK_SHIPPING_METHODS);
  /** MOCK DATA — replace initializer with [] and load via API */
  readonly orders = signal<Order[]>(MOCK_ORDERS);

  readonly business = this.branding.settings;
  readonly money = money;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly quoteId = computed(() => this.params().get('quoteId') ?? '');
  readonly quote = computed<Quote | undefined>(() => {
    const all = this.quotes();
    return all.find((q) => q.id === this.quoteId()) ?? all[0];
  });

  /** Preview-only switches so both blocked paths stay reviewable in the mockup. */
  readonly noActiveMethods = signal(false);
  readonly simulateFailure = signal(false);

  readonly selectedId = signal<string | null>(null);
  readonly redirecting = signal(false);
  readonly submitted = signal(false);

  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly availableMethods = computed<ShippingMethod[]>(() =>
    this.noActiveMethods() ? [] : this.methods().filter((m) => m.isActive),
  );

  readonly selected = computed<ShippingMethod | undefined>(() =>
    this.availableMethods().find((m) => m.id === this.selectedId()),
  );

  readonly shippingCents = computed(() => {
    const method = this.selected();
    return method ? this.costOf(method) : 0;
  });

  readonly totalCents = computed(() => (this.quote()?.totalCents ?? 0) + this.shippingCents());

  readonly form = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    company: [''],
    line1: ['', Validators.required],
    line2: [''],
    city: ['', Validators.required],
    region: ['', Validators.required],
    postcode: ['', Validators.required],
    country: ['', Validators.required],
    phone: ['', Validators.required],
  });

  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  readonly formValid = computed(() => this.status() === 'VALID');

  readonly canPay = computed(
    () => !!this.selected() && this.formValid() && !this.noActiveMethods() && !this.redirecting(),
  );

  constructor() {
    // Prefills the address saved against the account, as the real API will.
    const saved = this.orders()[0]?.shippingAddress;
    if (saved) this.form.setValue({ ...saved });
  }

  /** flat = fixed rate; perSheet = rate multiplied by the nested sheet count. */
  costOf(method: ShippingMethod): number {
    return method.rateType === 'flat'
      ? method.rateCents
      : method.rateCents * (this.quote()?.sheetCount ?? 1);
  }

  rateExplanation(method: ShippingMethod): string {
    if (method.rateType === 'flat') return 'Flat rate';
    const sheets = this.quote()?.sheetCount ?? 1;
    return `${money(method.rateCents)} × ${sheets} sheet${sheets === 1 ? '' : 's'}`;
  }

  select(id: string): void {
    if (this.noActiveMethods()) return;
    this.selectedId.set(id);
  }

  invalid(name: 'fullName' | 'line1' | 'city' | 'region' | 'postcode' | 'country' | 'phone'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  toggleNoMethods(): void {
    this.noActiveMethods.update((v) => !v);
    if (this.noActiveMethods()) this.selectedId.set(null);
  }

  toggleFailure(): void {
    this.simulateFailure.update((v) => !v);
  }

  /** Stands in for the hosted Stripe Checkout redirect. */
  pay(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (!this.canPay()) return;
    if (this.simulateFailure()) return;

    this.redirecting.set(true);
    this.timer = setTimeout(() => {
      void this.router.navigate(['/checkout', this.quoteId(), 'return'], {
        queryParams: { session_id: 'cs_test_123' },
      });
    }, 900);
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }
}
