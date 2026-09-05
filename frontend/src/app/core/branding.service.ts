import { Injectable, signal } from '@angular/core';
import type { BusinessSettings } from './models';
import { MOCK_BUSINESS } from './mock/fixtures';

/**
 * Loads business settings at bootstrap and applies branding (company name, logo and
 * the --primary / --accent custom properties) across every customer-facing page.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  readonly settings = signal<BusinessSettings>(MOCK_BUSINESS);

  constructor() {
    this.apply(this.settings());
  }

  update(patch: Partial<BusinessSettings>): void {
    const next = { ...this.settings(), ...patch };
    this.settings.set(next);
    this.apply(next);
  }

  private apply(settings: BusinessSettings): void {
    const root = document.documentElement;
    if (/^#[0-9a-fA-F]{6}$/.test(settings.primaryColor)) {
      root.style.setProperty('--primary', settings.primaryColor);
    }
    if (/^#[0-9a-fA-F]{6}$/.test(settings.accentColor)) {
      root.style.setProperty('--accent', settings.accentColor);
    }
    document.title = `${settings.companyName} — Quick Quote`;
  }
}
