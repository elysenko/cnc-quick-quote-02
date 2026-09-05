import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { BrandingService } from '../../core/branding.service';
import type { Order, Quote, ShippingMethod } from '../../core/models';
import { money } from '../../core/format';
import { ApiError } from '../../core/api.service';
import { CheckoutApi, OrderApi, PricedShippingMethod, QuoteApi, ShippingApi } from '../../core/api/domain.service';

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

  private readonly quoteApi = inject(QuoteApi);
  private readonly shippingApi = inject(ShippingApi);
  private readonly orderApi = inject(OrderApi);
  private readonly checkoutApi = inject(CheckoutApi);

  readonly quotes = signal<Quote[]>([]);
  readonly methods = signal<PricedShippingMethod[]>([]);
  /** Past orders, used only to prefill the address the customer last shipped to. */
  readonly orders = signal<Order[]>([]);

  readonly business = this.branding.settings;
  readonly money = money;
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly payError = signal<string | null>(null);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly quoteId = computed(() => this.params().get('quoteId') ?? '');
  readonly quote = computed<Quote | undefined>(() => this.quotes().find((q) => q.id === this.quoteId()));

  /**
   * True when the workshop has NO active shipping method. The server answers 409 for
   * that case; the template then blocks checkout and shows the "contact us" copy.
   * In preview builds the toggles below drive it so both blocked paths stay
   * reviewable in the mockup.
   */
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
    effect(() => {
      const id = this.quoteId();
      if (id) void this.load(id);
    });
  }

  /**
   * Loads the quote and the shipping methods priced for its sheet count. A 409 from
   * the shipping endpoint means the workshop has no active method — that is a
   * blocked-checkout state, not an error, so it flips noActiveMethods rather than
   * showing a failure. Past orders are fetched only to prefill the address.
   */
  private async load(quoteId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.quotes.set([await this.quoteApi.get(quoteId)]);
    } catch (error) {
      this.quotes.set([]);
      this.loadError.set((error as Error).message);
      this.loading.set(false);
      return;
    }
    try {
      const methods = await this.shippingApi.forQuote(quoteId);
      this.methods.set(methods);
      this.noActiveMethods.set(methods.length === 0);
      if (methods.length === 1) this.selectedId.set(methods[0].id);
    } catch (error) {
      this.methods.set([]);
      this.noActiveMethods.set(true);
      if (!(error instanceof ApiError) || error.status !== 409) {
        this.loadError.set((error as Error).message);
      }
    }
    try {
      const orders = await this.orderApi.list();
      this.orders.set(orders);
      const saved = orders[0]?.shippingAddress;
      if (saved) this.form.setValue({ ...saved });
    } catch {
      // No prior orders (or the call failed) — the customer types a fresh address.
    }
    this.loading.set(false);
  }

  /**
   * flat = fixed rate; perSheet = rate × nested sheet count. The server sends the
   * resolved `costCents`, which is authoritative; this recomputation is the fallback
   * for a method that arrived without one.
   */
  costOf(method: ShippingMethod): number {
    const priced = this.methods().find((m) => m.id === method.id);
    if (priced && typeof priced.costCents === 'number') return priced.costCents;
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

  /** Preview-only switch; in production the real 409 sets noActiveMethods. */
  toggleNoMethods(): void {
    if (!COLOSSUS_PREVIEW) return;
    this.noActiveMethods.update((v) => !v);
    if (this.noActiveMethods()) this.selectedId.set(null);
  }

  /** Preview-only switch; in production a real 503 sets the same error banner. */
  toggleFailure(): void {
    if (!COLOSSUS_PREVIEW) return;
    this.simulateFailure.update((v) => !v);
  }

  /**
   * Creates a Stripe Checkout Session and hands the browser to Stripe's hosted page.
   * No order exists yet at this point — the order is created only when Stripe
   * confirms payment via the webhook, so abandoning here leaves the quote intact and
   * retryable. A 503 means the payment service is unreachable; the quote is
   * untouched and the customer can try again.
   */
  async pay(): Promise<void> {
    this.submitted.set(true);
    this.payError.set(null);
    this.form.markAllAsTouched();
    if (!this.canPay()) return;
    const method = this.selected();
    if (!method) return;

    if (COLOSSUS_PREVIEW) {
      if (this.simulateFailure()) return;
      this.redirecting.set(true);
      this.timer = setTimeout(() => {
        void this.router.navigate(['/checkout', this.quoteId(), 'return'], {
          queryParams: { session_id: 'preview-session' },
        });
      }, 900);
      return;
    }

    this.redirecting.set(true);
    try {
      const session = await this.checkoutApi.createSession(
        this.quoteId(),
        method.id,
        this.form.getRawValue(),
      );
      // Full-page navigation: Stripe Checkout is a hosted page on their origin.
      window.location.href = session.url;
    } catch (error) {
      this.redirecting.set(false);
      this.simulateFailure.set(true);
      this.payError.set((error as Error).message);
    }
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }
}
