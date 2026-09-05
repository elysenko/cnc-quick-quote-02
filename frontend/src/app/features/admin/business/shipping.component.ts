import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MOCK_SHIPPING_METHODS, money } from '../../../core/mock/fixtures';
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

  // MOCK DATA — replace initializer with [] and load via API
  readonly methods = signal<ShippingMethod[]>(MOCK_SHIPPING_METHODS);

  readonly loading = signal(false);
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

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const patch = {
      name: value.name.trim(),
      rateType: value.rateType,
      rateCents: Math.round(value.rate * 100),
      estDeliveryDays: Math.round(value.estDeliveryDays),
      isActive: value.isActive,
    };
    const id = this.editingId();
    if (id) {
      this.methods.update((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    } else {
      this.methods.update((list) => [
        ...list,
        { id: `S${list.length + 1}${Date.now().toString().slice(-3)}`, ...patch },
      ]);
    }
    this.confirm(`${patch.name} saved`);
    this.closeEditor();
  }

  toggleActive(method: ShippingMethod): void {
    this.methods.update((list) =>
      list.map((m) => (m.id === method.id ? { ...m, isActive: !m.isActive } : m)),
    );
    this.confirm(`${method.name} ${method.isActive ? 'deactivated' : 'activated'}`);
  }

  remove(method: ShippingMethod): void {
    this.methods.update((list) => list.filter((m) => m.id !== method.id));
    if (this.editingId() === method.id) this.closeEditor();
    this.confirm(`${method.name} deleted`);
  }

  private confirm(message: string): void {
    this.savedMessage.set(message);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2600);
  }
}
