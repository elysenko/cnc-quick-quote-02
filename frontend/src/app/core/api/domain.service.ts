import { Injectable, inject } from '@angular/core';
import { ApiService } from '../api.service';
import type {
  BendLine,
  Drawing,
  IntegrationSetting,
  MachineSettings,
  Material,
  Order,
  PricingSettings,
  Quote,
  ShippingMethod,
} from '../models';

/** Shipping method as returned for a specific quote, with its cost resolved. */
export interface PricedShippingMethod extends ShippingMethod {
  costCents: number;
}

@Injectable({ providedIn: 'root' })
export class DrawingApi {
  private readonly api = inject(ApiService);

  list(): Promise<Drawing[]> {
    return this.api.get<Drawing[]>('/drawings');
  }

  get(id: string): Promise<Drawing> {
    return this.api.get<Drawing>(`/drawings/${id}`);
  }

  upload(file: File): Promise<Drawing> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.upload<Drawing>('/drawings', form);
  }

  bends(drawingId: string): Promise<BendLine[]> {
    return this.api.get<BendLine[]>(`/drawings/${drawingId}/bends`);
  }

  createBend(drawingId: string, bend: Omit<BendLine, 'id' | 'drawingId'>): Promise<BendLine> {
    return this.api.post<BendLine>(`/drawings/${drawingId}/bends`, bend);
  }

  updateBend(drawingId: string, id: string, patch: Partial<BendLine>): Promise<BendLine> {
    return this.api.patch<BendLine>(`/drawings/${drawingId}/bends/${id}`, patch);
  }

  deleteBend(drawingId: string, id: string): Promise<void> {
    return this.api.delete<void>(`/drawings/${drawingId}/bends/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class MaterialApi {
  private readonly api = inject(ApiService);

  /** Customer catalogue — the server returns active materials only. */
  list(): Promise<Material[]> {
    return this.api.get<Material[]>('/materials');
  }

  /** Admin catalogue — includes deactivated rows. */
  listAll(): Promise<Material[]> {
    return this.api.get<Material[]>('/admin/materials');
  }

  create(data: Partial<Material>): Promise<Material> {
    return this.api.post<Material>('/admin/materials', data);
  }

  update(id: string, patch: Partial<Material>): Promise<Material> {
    return this.api.patch<Material>(`/admin/materials/${id}`, patch);
  }
}

@Injectable({ providedIn: 'root' })
export class QuoteApi {
  private readonly api = inject(ApiService);

  list(status?: string): Promise<Quote[]> {
    const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    return this.api.get<Quote[]>(`/quotes${query}`);
  }

  get(id: string): Promise<Quote> {
    return this.api.get<Quote>(`/quotes/${id}`);
  }

  create(drawingId: string, materialId: string, quantity: number): Promise<Quote> {
    return this.api.post<Quote>('/quotes', { drawingId, materialId, quantity });
  }
}

@Injectable({ providedIn: 'root' })
export class OrderApi {
  private readonly api = inject(ApiService);

  list(): Promise<Order[]> {
    return this.api.get<Order[]>('/orders');
  }

  get(id: string): Promise<Order> {
    return this.api.get<Order>(`/orders/${id}`);
  }

  /** 404 until the Stripe webhook lands — the return page polls on that signal. */
  bySession(sessionId: string): Promise<Order> {
    return this.api.get<Order>(`/orders/by-session/${encodeURIComponent(sessionId)}`);
  }
}

@Injectable({ providedIn: 'root' })
export class ShippingApi {
  private readonly api = inject(ApiService);

  /** 409 when the workshop has no active method — checkout blocks on that. */
  forQuote(quoteId: string): Promise<PricedShippingMethod[]> {
    return this.api.get<PricedShippingMethod[]>(`/shipping-methods?quoteId=${encodeURIComponent(quoteId)}`);
  }

  listAll(): Promise<ShippingMethod[]> {
    return this.api.get<ShippingMethod[]>('/admin/shipping-methods');
  }

  create(data: Partial<ShippingMethod>): Promise<ShippingMethod> {
    return this.api.post<ShippingMethod>('/admin/shipping-methods', data);
  }

  update(id: string, patch: Partial<ShippingMethod>): Promise<ShippingMethod> {
    return this.api.patch<ShippingMethod>(`/admin/shipping-methods/${id}`, patch);
  }

  remove(id: string): Promise<void> {
    return this.api.delete<void>(`/admin/shipping-methods/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class CheckoutApi {
  private readonly api = inject(ApiService);

  /** Returns the hosted Stripe URL to redirect the browser to. */
  createSession(
    quoteId: string,
    shippingMethodId: string,
    shippingAddress: Record<string, string>,
  ): Promise<{ url: string; sessionId: string }> {
    return this.api.post(`/checkout/${quoteId}/session`, { shippingMethodId, shippingAddress });
  }
}

@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly api = inject(ApiService);

  pricing(): Promise<PricingSettings> {
    return this.api.get<PricingSettings>('/admin/pricing');
  }

  savePricing(patch: Partial<PricingSettings>): Promise<PricingSettings> {
    return this.api.patch<PricingSettings>('/admin/pricing', patch);
  }

  machine(): Promise<MachineSettings> {
    return this.api.get<MachineSettings>('/admin/machine');
  }

  saveMachine(patch: Partial<MachineSettings>): Promise<MachineSettings> {
    return this.api.patch<MachineSettings>('/admin/machine', patch);
  }

  integrations(): Promise<IntegrationSetting[]> {
    return this.api.get<IntegrationSetting[]>('/admin/integrations');
  }

  saveCredential(key: string, value: string): Promise<IntegrationSetting> {
    return this.api.put<IntegrationSetting>(`/admin/integrations/${encodeURIComponent(key)}`, { value });
  }

  clearCredential(key: string): Promise<IntegrationSetting> {
    return this.api.delete<IntegrationSetting>(`/admin/integrations/${encodeURIComponent(key)}`);
  }
}
