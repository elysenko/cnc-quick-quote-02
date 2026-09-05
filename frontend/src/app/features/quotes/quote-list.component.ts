import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Quote } from '../../core/models';
import { MOCK_QUOTES, money } from '../../core/mock/fixtures';

@Component({
  selector: 'app-quote-list',
  imports: [RouterLink],
  templateUrl: './quote-list.component.html',
  styleUrl: './quote-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly money = money;
  // MOCK DATA — replace initializer with [] and load via API
  readonly quotes = signal<Quote[]>(MOCK_QUOTES);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: null });
  readonly status = computed(() => this.queryParams()?.get('status') ?? 'all');
  readonly sort = computed(() => this.queryParams()?.get('sort') ?? 'newest');
  readonly page = computed(() => Math.max(1, Number(this.queryParams()?.get('page')) || 1));
  readonly pageSize = 10;

  readonly statuses = [
    { key: 'all', label: 'All quotes' },
    { key: 'draft', label: 'Awaiting checkout' },
    { key: 'ordered', label: 'Ordered' },
    { key: 'expired', label: 'Expired' },
  ];

  readonly filtered = computed(() => {
    const status = this.status();
    const list = this.quotes().filter((q) => status === 'all' || q.status === status);
    const sorted = [...list].sort((a, b) =>
      this.sort() === 'total'
        ? b.totalCents - a.totalCents
        : Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
    return sorted;
  });

  readonly visible = computed(() =>
    this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize),
  );

  readonly totalValue = computed(() =>
    this.filtered().reduce((sum, q) => sum + q.totalCents, 0),
  );

  setStatus(status: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: status === 'all' ? null : status, page: null },
      queryParamsHandling: 'merge',
    });
  }

  setSort(event: Event): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: (event.target as HTMLSelectElement).value },
      queryParamsHandling: 'merge',
    });
  }

  badgeClass(status: Quote['status']): string {
    if (status === 'ordered') return 'badge badge-ok';
    if (status === 'expired') return 'badge badge-neutral';
    return 'badge badge-info';
  }

  statusLabel(status: Quote['status']): string {
    if (status === 'ordered') return 'Ordered';
    if (status === 'expired') return 'Expired';
    return 'Awaiting checkout';
  }
}
