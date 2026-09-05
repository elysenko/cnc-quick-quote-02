import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import type { Order } from '../../core/models';
import { money } from '../../core/format';
import { OrderApi } from '../../core/api/domain.service';

interface StatusFilter {
  id: string;
  label: string;
}

const FILTERS: StatusFilter[] = [
  { id: 'all', label: 'All orders' },
  { id: 'paid', label: 'Paid' },
  { id: 'in_production', label: 'In production' },
  { id: 'shipped', label: 'Shipped' },
];

/** Order history. The active status filter lives in ?status= so it is deep-linkable. */
@Component({
  selector: 'app-order-list',
  imports: [RouterLink, DatePipe],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly orderApi = inject(OrderApi);

  readonly orders = signal<Order[]>([]);

  readonly filters = FILTERS;
  readonly money = money;
  readonly loading = signal(true);
  readonly skeletonRows = [0, 1, 2, 3];

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly activeStatus = computed(() => this.query().get('status') ?? 'all');

  readonly visibleOrders = computed<Order[]>(() => {
    const status = this.activeStatus();
    const all = this.orders();
    return status === 'all' ? all : all.filter((o) => o.status === status);
  });

  readonly loadError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.orders.set(await this.orderApi.list());
    } catch (error) {
      this.loadError.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  countFor(id: string): number {
    return id === 'all' ? this.orders().length : this.orders().filter((o) => o.status === id).length;
  }

  statusLabel(status: Order['status']): string {
    if (status === 'paid') return 'Paid';
    return status === 'in_production' ? 'In production' : 'Shipped';
  }

  statusClass(status: Order['status']): string {
    if (status === 'paid') return 'badge-info';
    return status === 'in_production' ? 'badge-warn' : 'badge-ok';
  }
}
