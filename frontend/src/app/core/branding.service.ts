import { Injectable, inject, signal } from '@angular/core';
import type { BusinessSettings } from './models';
import { ApiService } from './api.service';

/**
 * Neutral defaults used only for the first paint, before /api/business-settings
 * resolves. They are overwritten by the real settings on load — no sample data.
 */
const DEFAULTS: BusinessSettings = {
  companyName: 'CNC Quick Quote',
  logoUrl: '',
  primaryColor: '#1d4ed8',
  accentColor: '#ea580c',
  contactEmail: '',
  contactPhone: '',
  addressLine1: '',
  addressLine2: '',
  supportHours: '',
  stripePublishableKey: '',
  stripeSecretLast4: '',
  stripeWebhookLast4: '',
};

/**
 * Loads business settings at bootstrap and applies branding (company name, logo and
 * the --primary / --accent custom properties) across every customer-facing page.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly api = inject(ApiService);
  readonly settings = signal<BusinessSettings>(DEFAULTS);
  readonly loaded = signal(false);

  constructor() {
    this.apply(this.settings());
    void this.load();
  }

  /** Public endpoint — the sign-in page is branded before any session exists. */
  async load(): Promise<void> {
    try {
      const settings = await this.api.get<BusinessSettings>('/business-settings');
      this.settings.set({ ...DEFAULTS, ...settings });
      this.apply(this.settings());
    } catch {
      // Branding is cosmetic: a failure here must never block the app from rendering.
    } finally {
      this.loaded.set(true);
    }
  }

  /** Persists an admin edit, then re-applies the server's canonical response. */
  async save(patch: Record<string, unknown>): Promise<void> {
    const settings = await this.api.patch<BusinessSettings>('/admin/business', patch);
    this.settings.set({ ...DEFAULTS, ...settings });
    this.apply(this.settings());
  }

  /** Optimistic local update used by the admin forms for instant preview. */
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
