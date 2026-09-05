import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';

/** 403 view shown when an authenticated non-admin opens an /admin/** route. */
@Component({
  selector: 'app-forbidden',
  imports: [RouterLink],
  templateUrl: './forbidden.component.html',
  styleUrl: './forbidden.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForbiddenComponent {
  private readonly auth = inject(AuthService);
  private readonly branding = inject(BrandingService);

  readonly user = this.auth.user;
  readonly business = this.branding.settings;
  readonly role = computed(() => this.user()?.role ?? 'USER');
}
