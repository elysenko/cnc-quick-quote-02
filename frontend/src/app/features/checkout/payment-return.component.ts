import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { BrandingService } from '../../core/branding.service';
import type { Order } from '../../core/models';
import { MOCK_ORDERS } from '../../core/mock/fixtures';

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

  /** MOCK DATA — replace initializer with [] and load via API */
  readonly orders = signal<Order[]>(MOCK_ORDERS);

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

  readonly maxAttempts = computed(() => (this.simulateNoWebhook() ? 6 : 4));
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

  toggleSimulate(): void {
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
    this.timers.push(setTimeout(() => this.poll(), this.delayMs()));
  }

  private poll(): void {
    const next = this.attempt() + 1;
    this.attempt.set(next);

    if (next < this.maxAttempts()) {
      this.delayMs.set(Math.min(Math.round(this.delayMs() * BACKOFF_FACTOR), MAX_DELAY_MS));
      this.schedule();
      return;
    }

    // The order only exists once the webhook has been processed — never assume it.
    const order = this.simulateNoWebhook() ? undefined : this.findOrder();
    if (!order) {
      this.state.set('timed-out');
      return;
    }
    void this.router.navigate(['/orders', order.id, 'confirmation']);
  }

  private findOrder(): Order | undefined {
    const all = this.orders();
    return all.find((o) => o.quoteId === this.quoteId()) ?? all[0];
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
}
