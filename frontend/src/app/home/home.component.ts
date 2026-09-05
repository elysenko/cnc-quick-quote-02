import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { TRPC_CLIENT } from '../app.config';

import type { User } from '../trpc-client.types';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main data-testid="home-main">
      <h1 data-testid="home-title">Users</h1>

      @if (loading()) {
        <p data-testid="users-loading">Loading...</p>
      } @else if (error()) {
        <p data-testid="users-error">{{ error() }}</p>
      } @else {
        <ul data-testid="users-list">
          @for (user of users(); track user.id) {
            <li attr.data-testid="user-item-{{ user.id }}">
              {{ user.name }} — {{ user.email }}
            </li>
          }
        </ul>
      }
    </main>
  `,
  styles: [
    `
      main {
        max-width: 640px;
        margin: 2rem auto;
        padding: 0 1rem;
      }

      ul {
        margin-top: 1rem;
      }

      li {
        padding: 0.5rem 0;
        border-bottom: 1px solid #e5e7eb;
      }

      li:last-child {
        border-bottom: none;
      }
    `,
  ],
})
export class HomeComponent implements OnInit {
  private readonly trpc = inject(TRPC_CLIENT);

  users = signal<User[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const result = await this.trpc.users.findAll.query();
      this.users.set(result);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Failed to load users.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
