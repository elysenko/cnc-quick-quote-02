import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Child-route shell for the business settings area. Layout only — each tab owns
 * its own form state so a deep link renders that tab directly.
 */
@Component({
  selector: 'app-business-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './business-shell.component.html',
  styleUrl: './business-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessShellComponent {}
