import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { money } from '../../../core/format';
import { ShippingApi } from '../../../core/api/domain.service';
import type { ShippingMethod } from '../../../core/models';

/** Shipping method catalogue. Customers pick one of the active methods at checkout. */
@Component({
  selector: 'app-admin-shipping',
  imports: [ReactiveFormsModule],
  templateUrl: './shipping.component.html',
  styleUrl: './shipping.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShippingComponent {
  private readonly fb = inject(FormBuilder);
  private readonly shippingApi = inject(ShippingApi);

  readonly methods = signal<ShippingMethod[]>([]);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saved = signal(false);
  readonly savedMessage = signal('');
  readonly editorOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly money = money;
  readonly skeletonRows = [1, 2, 3];

  readonly activeMethods = computed(() => this.methods().filter((m) => m.isActive));

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    rateType: ['flat' as ShippingMethod['rateType'], [Validators.required]],
    rate: [0, [Validators.required, Validators.min(0)]],
    estDeliveryDays: [3, [Validators.required, Validators.min(0), Validators.max(90)]],
    isActive: [true],
  });

  rateLabel(method: ShippingMethod): string {
    return method.rateType === 'perSheet'
      ? `${money(method.rateCents)} / sheet`
      : money(method.rateCents);
  }

  deliveryLabel(method: ShippingMethod): string {
    if (method.estDeliveryDays === 0) return 'Same day';
    return method.estDeliveryDays === 1 ? '1 day' : `${method.estDeliveryDays} days`;
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', rateType: 'flat', rate: 0, estDeliveryDays: 3, isActive: true });
    this.editorOpen.set(true);
  }

  openEdit(method: ShippingMethod): void {
    this.editingId.set(method.id);
    this.form.reset({
      name: method.name,
      rateType: method.rateType,
      rate: method.rateCents / 100,
      estDeliveryDays: method.estDeliveryDays,
      isActive: method.isActive,
    });
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    this.editorOpen.set(false);
    this.editingId.set(null);
  }

  constructor() {
    void this.load();
  }

  /** Admin list — includes inactive methods, unlike the checkout-facing endpoint. */
  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.methods.set(await this.shippingApi.listAll());
    } catch (error) {
      this.loadError.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    // The form works in dollars; the API and database store integer cents only.
    const patch = {
      name: value.name.trim(),
      rateType: value.rateType,
      rateCents: Math.round(value.rate * 100),
      estDeliveryDays: Math.round(value.estDeliveryDays),
      isActive: value.isActive,
    };
    const id = this.editingId();
    try {
      if (id) {
        const saved = await this.shippingApi.update(id, patch);
        this.methods.update((list) => list.map((m) => (m.id === id ? saved : m)));
      } else {
        const created = await this.shippingApi.create(patch);
        this.methods.update((list) => [...list, created]);
      }
    } catch (error) {
      this.loadError.set((error as Error).message);
      return;
    }
    this.confirm(`${patch.name} saved`);
    this.closeEditor();
  }

  /** Optimistic toggle with rollback — the row has no per-row pending affordance. */
  async toggleActive(method: ShippingMethod): Promise<void> {
    const next = !method.isActive;
    this.methods.update((list) => list.map((m) => (m.id === method.id ? { ...m, isActive: next } : m)));
    try {
      const saved = await this.shippingApi.update(method.id, { isActive: next });
      this.methods.update((list) => list.map((m) => (m.id === method.id ? saved : m)));
      this.confirm(`${method.name} ${next ? 'activated' : 'deactivated'}`);
    } catch (error) {
      this.methods.update((list) =>
        list.map((m) => (m.id === method.id ? { ...m, isActive: method.isActive } : m)),
      );
      this.loadError.set((error as Error).message);
    }
  }

  /**
   * The server deactivates rather than deletes when past orders reference the
   * method, so the list is refetched instead of assuming the row disappeared.
   */
  async remove(method: ShippingMethod): Promise<void> {
    try {
      await this.shippingApi.remove(method.id);
    } catch (error) {
      this.loadError.set((error as Error).message);
      return;
    }
    if (this.editingId() === method.id) this.closeEditor();
    this.confirm(`${method.name} deleted`);
    await this.load();
  }

  private confirm(message: string): void {
    this.savedMessage.set(message);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2600);
  }
}
