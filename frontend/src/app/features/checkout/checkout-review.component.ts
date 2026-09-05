import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import type { Quote } from '../../core/models';
import { money } from '../../core/format';
import { QuoteApi } from '../../core/api/domain.service';

/**
 * Checkout step 1 — read-only confirmation of the quoted job and its itemised
 * pricing before the customer picks a delivery method.
 */
@Component({
  selector: 'app-checkout-review',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './checkout-review.component.html',
  styleUrl: './checkout-review.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutReviewComponent {
  private readonly route = inject(ActivatedRoute);

  private readonly quoteApi = inject(QuoteApi);

  readonly quotes = signal<Quote[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly quoteId = computed(() => this.params().get('quoteId') ?? '');

  /**
   * The quote named by the URL, or undefined when it does not exist or belongs to
   * another account. Undefined is deliberate — the template's not-found state is the
   * honest answer to a bad deep link, not somebody else's quote.
   */
  readonly quote = computed<Quote | undefined>(() =>
    this.quotes().find((q) => q.id === this.quoteId()),
  );

  readonly money = money;

  constructor() {
    effect(() => {
      const id = this.quoteId();
      if (id) void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.quotes.set([await this.quoteApi.get(id)]);
    } catch (error) {
      this.quotes.set([]);
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
