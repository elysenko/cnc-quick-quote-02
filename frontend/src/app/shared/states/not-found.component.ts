import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BrandingService } from '../../core/branding.service';

/** Catch-all 404 view for unknown URLs. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
  private readonly router = inject(Router);
  private readonly branding = inject(BrandingService);

  readonly business = this.branding.settings;
  /** The URL the browser asked for, captured before any further navigation. */
  readonly attemptedPath = signal<string>(this.router.url);
}
