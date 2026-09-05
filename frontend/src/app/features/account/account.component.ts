import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';
import type { Order, Role, ShippingAddress } from '../../core/models';
import { MOCK_ORDERS } from '../../core/mock/fixtures';

/** Account overview: identity, default delivery address and quick links. */
@Component({
  selector: 'app-account',
  imports: [RouterLink, DatePipe],
  templateUrl: './account.component.html',
  styleUrl: './account.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent {
  private readonly auth = inject(AuthService);
  private readonly branding = inject(BrandingService);

  /** Preview-only affordances are folded out of production bundles. */
  readonly isPreview = COLOSSUS_PREVIEW;

  /** MOCK DATA — replace initializer with [] and load via API */
  readonly orders = signal<Order[]>(MOCK_ORDERS);
  /** MOCK DATA — replace with the account's createdAt from the API */
  readonly memberSince = signal<string>('2025-04-18T09:00:00Z');

  readonly user = this.auth.user;
  readonly business = this.branding.settings;

  readonly defaultAddress = computed<ShippingAddress | null>(
    () => this.orders()[0]?.shippingAddress ?? null,
  );

  readonly orderCount = computed(() => this.orders().length);

  roleClass(role: Role | undefined): string {
    if (role === 'ADMIN') return 'badge-info';
    return role === 'MANAGER' ? 'badge-warn' : 'badge-neutral';
  }

  initials(): string {
    const source = this.user()?.name || this.user()?.email || '?';
    return source
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  setRole(role: Role): void {
    this.auth.setRole(role);
  }

  signOut(): void {
    void this.auth.logout();
  }
}
