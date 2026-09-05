import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { BrandingService } from '../../core/branding.service';
import type { Order } from '../../core/models';
import { OrderApi } from '../../core/api/domain.service';

const FIRST_DELAY_MS = 800;
const BACKOFF_FACTOR = 1.6;
const MAX_DELAY_MS = 5000;

/**
 * Checkout step 3 — Stripe returns here immediately after payment while the webhook
 * that creates the order may still be in flight. Polls with exponential backoff and
 * never assumes the order already exists.
 */
@Component({
  selector: 'app-payment-return',
  imports: [RouterLink],
  templateUrl: './payment-return.component.html',
  styleUrl: './payment-return.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentReturnComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly branding = inject(BrandingService);

  private readonly orderApi = inject(OrderApi);

  readonly orders = signal<Order[]>([]);
  readonly business = this.branding.settings;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly quoteId = computed(() => this.params().get('quoteId') ?? '');
  readonly sessionId = computed(() => this.query().get('session_id') ?? 'unknown');

  readonly attempt = signal(0);
  readonly delayMs = signal(FIRST_DELAY_MS);
  readonly state = signal<'confirming' | 'timed-out'>('confirming');

  /** Preview-only switch that exercises the bounded-failure path. */
  readonly simulateNoWebhook = signal(false);

  /** Enough attempts to cover ~30s of backoff — a webhook normally lands in under 2s. */
  readonly maxAttempts = computed(() => (this.simulateNoWebhook() ? 6 : 8));
  readonly progressPct = computed(() =>
    Math.min(100, Math.round((this.attempt() / this.maxAttempts()) * 100)),
  );

  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit(): void {
    this.schedule();
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  /** Preview-only switch that exercises the bounded-failure path. */
  toggleSimulate(): void {
    if (!COLOSSUS_PREVIEW) return;
    this.simulateNoWebhook.update((v) => !v);
    this.restart();
  }

  retry(): void {
    this.restart();
  }

  private restart(): void {
    this.clearTimers();
    this.attempt.set(0);
    this.delayMs.set(FIRST_DELAY_MS);
    this.state.set('confirming');
    this.schedule();
  }

  private schedule(): void {
    this.timers.push(setTimeout(() => void this.poll(), this.delayMs()));
  }

  /**
   * One poll tick. Stripe redirects the customer here the instant payment succeeds,
   * which can beat the webhook that actually creates the order — so a 404 is the
   * EXPECTED early answer, not a failure. Each miss backs off and retries; only
   * after maxAttempts does the page fall back to the "we'll email you" state, which
   * is safe because the order will still be created when the webhook lands.
   */
  private async poll(): Promise<void> {
    const next = this.attempt() + 1;
    this.attempt.set(next);

    const order = await this.findOrder();
    if (order) {
      await this.router.navigate(['/orders', order.id, 'confirmation']);
      return;
    }

    if (next < this.maxAttempts()) {
      this.delayMs.set(Math.min(Math.round(this.delayMs() * BACKOFF_FACTOR), MAX_DELAY_MS));
      this.schedule();
      return;
    }
    this.state.set('timed-out');
  }

  /** Resolves the order for this payment session, or undefined while it is pending. */
  private async findOrder(): Promise<Order | undefined> {
    if (COLOSSUS_PREVIEW) {
      // No server behind the static preview host; exercise the timed-out path only.
      return undefined;
    }
    if (this.simulateNoWebhook()) return undefined;
    const sessionId = this.sessionId();
    try {
      if (sessionId && sessionId !== 'unknown') {
        const order = await this.orderApi.bySession(sessionId);
        this.orders.set([order]);
        return order;
      }
      // No session id in the URL — fall back to matching on the quote.
      const orders = await this.orderApi.list();
      this.orders.set(orders);
      return orders.find((o) => o.quoteId === this.quoteId());
    } catch {
      // 404 means the webhook has not landed yet; keep polling.
      return undefined;
    }
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
}
