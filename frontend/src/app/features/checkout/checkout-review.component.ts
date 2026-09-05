import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import type { Quote } from '../../core/models';
import { MOCK_QUOTES, money } from '../../core/mock/fixtures';

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

  /** MOCK DATA — replace initializer with [] and load via API */
  readonly quotes = signal<Quote[]>(MOCK_QUOTES);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly quoteId = computed(() => this.params().get('quoteId') ?? '');

  /** Falls back to the first quote so a deep link with an unknown id still renders. */
  readonly quote = computed<Quote | undefined>(() => {
    const all = this.quotes();
    return all.find((q) => q.id === this.quoteId()) ?? all[0];
  });

  readonly money = money;
}
