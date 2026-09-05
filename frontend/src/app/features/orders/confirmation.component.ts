import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';
import type { Order, ShippingMethod } from '../../core/models';
import { MOCK_ORDERS, MOCK_SHIPPING_METHODS, money } from '../../core/mock/fixtures';

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
  private readonly auth = inject(AuthService);
  private readonly branding = inject(BrandingService);

  /** MOCK DATA — replace initializer with [] and load via API */
  readonly orders = signal<Order[]>(MOCK_ORDERS);
  /** MOCK DATA — replace initializer with [] and load via API */
  readonly shippingMethods = signal<ShippingMethod[]>(MOCK_SHIPPING_METHODS);

  readonly business = this.branding.settings;
  readonly user = this.auth.user;
  readonly money = money;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly orderId = computed(() => this.params().get('id') ?? '');

  /** Falls back to the most recent order so a deep link always renders a receipt. */
  readonly order = computed<Order | undefined>(() => {
    const all = this.orders();
    return all.find((o) => o.id === this.orderId()) ?? all[0];
  });

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
