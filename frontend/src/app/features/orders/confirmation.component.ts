import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';
import type { Order, ShippingMethod } from '../../core/models';
import { money } from '../../core/format';
import { OrderApi, ShippingApi } from '../../core/api/domain.service';

/** Post-payment receipt. Renders identically on a fresh deep-linked load. */
@Component({
  selector: 'app-order-confirmation',
  imports: [RouterLink, DatePipe],
  templateUrl: './confirmation.component.html',
  styleUrl: './confirmation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly orderApi = inject(OrderApi);
  private readonly shippingApi = inject(ShippingApi);
  private readonly auth = inject(AuthService);
  private readonly branding = inject(BrandingService);

  readonly orders = signal<Order[]>([]);
  readonly shippingMethods = signal<ShippingMethod[]>([]);

  readonly business = this.branding.settings;
  readonly user = this.auth.user;
  readonly money = money;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly orderId = computed(() => this.params().get('id') ?? '');
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  /**
   * The order named by the URL, or undefined when it does not exist or belongs to
   * another account — the template's not-found state is the honest answer to a bad
   * deep link rather than somebody else's receipt.
   */
  readonly order = computed<Order | undefined>(() => this.orders().find((o) => o.id === this.orderId()));

  constructor() {
    effect(() => {
      const id = this.orderId();
      if (id) void this.load(id);
    });
  }

  /** Shipping methods are fetched only to resolve the quoted lead time below. */
  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.orders.set([await this.orderApi.get(id)]);
    } catch (error) {
      this.orders.set([]);
      this.loadError.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
    try {
      this.shippingMethods.set(await this.shippingApi.listAll());
    } catch {
      // Non-admins cannot list methods; expectedDelivery falls back to its default.
    }
  }

  /** Estimated delivery = placed date + the method's quoted lead time. */
  readonly expectedDelivery = computed<string | null>(() => {
    const current = this.order();
    if (!current) return null;
    const method = this.shippingMethods().find((m) => m.name === current.shippingMethodName);
    const days = method?.estDeliveryDays ?? 5;
    const placed = new Date(current.placedAt);
    if (Number.isNaN(placed.getTime())) return null;
    placed.setDate(placed.getDate() + days);
    return placed.toISOString();
  });

  statusLabel(status: Order['status']): string {
    if (status === 'paid') return 'Paid';
    return status === 'in_production' ? 'In production' : 'Shipped';
  }

  statusClass(status: Order['status']): string {
    if (status === 'paid') return 'badge-info';
    return status === 'in_production' ? 'badge-warn' : 'badge-ok';
  }

  readonly copied = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  async copy(key: string, value: string): Promise<void> {
    try {
      await navigator.clipboard?.writeText(value);
      this.copied.set(key);
    } catch {
      this.copied.set(null);
      return;
    }
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.copied.set(null), 1800);
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }
}
