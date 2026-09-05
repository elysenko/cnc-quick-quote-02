import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MOCK_MATERIALS } from '../../core/mock/fixtures';
import type { Material } from '../../core/models';

type StatusFilter = 'all' | 'active' | 'inactive';
type ModalMode = 'create' | 'edit' | null;

/**
 * Material catalogue CRUD. Filter + modal state live ENTIRELY in the URL
 * (`?status=&modal=&id=`) so a cold load of
 * /admin/materials?status=inactive&modal=edit&id=M3 restores the exact view.
 */
@Component({
  selector: 'app-admin-materials',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-materials.component.html',
  styleUrl: './admin-materials.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMaterialsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  // MOCK DATA — replace initializer with [] and load via API
  readonly materials = signal<Material[]>(MOCK_MATERIALS);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  /** Simulated 422 from the API (e.g. duplicate name). */
  readonly serverError = signal<string | null>(null);
  readonly saved = signal(false);
  readonly savedMessage = signal('');
  readonly skeletonRows = [1, 2, 3];

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly status = computed<StatusFilter>(() => {
    const raw = this.params().get('status');
    return raw === 'active' || raw === 'inactive' ? raw : 'all';
  });

  readonly modal = computed<ModalMode>(() => {
    const raw = this.params().get('modal');
    return raw === 'create' || raw === 'edit' ? raw : null;
  });

  readonly editingId = computed(() => this.params().get('id'));

  readonly editing = computed<Material | null>(
    () => this.materials().find((m) => m.id === this.editingId()) ?? null,
  );

  readonly visible = computed<Material[]>(() => {
    const status = this.status();
    return this.materials().filter((m) =>
      status === 'all' ? true : status === 'active' ? m.isActive : !m.isActive,
    );
  });

  readonly activeCount = computed(() => this.materials().filter((m) => m.isActive).length);
  readonly inactiveCount = computed(() => this.materials().length - this.activeCount());

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    thicknessMm: [1.5, [Validators.required, Validators.min(0.1)]],
    sheetWidthMm: [1220, [Validators.required, Validators.min(1)]],
    sheetHeightMm: [2440, [Validators.required, Validators.min(1)]],
    costMultiplier: [1, [Validators.required, Validators.min(0)]],
    isActive: [true],
  });

  constructor() {
    effect(
      () => {
        const mode = this.modal();
        const id = this.editingId();
        untracked(() => this.syncForm(mode, id));
      },
      { allowSignalWrites: true },
    );
  }

  private syncForm(mode: ModalMode, id: string | null): void {
    if (mode === null) return;
    this.serverError.set(null);
    const target = mode === 'edit' ? untracked(this.materials).find((m) => m.id === id) : undefined;
    this.form.reset({
      name: target?.name ?? '',
      thicknessMm: target?.thicknessMm ?? 1.5,
      sheetWidthMm: target?.sheetWidthMm ?? 1220,
      sheetHeightMm: target?.sheetHeightMm ?? 2440,
      costMultiplier: target?.costMultiplier ?? 1,
      isActive: target?.isActive ?? true,
    });
  }

  private merge(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }

  setStatus(status: StatusFilter): void {
    this.merge({ status: status === 'all' ? null : status });
  }

  openCreate(): void {
    this.merge({ modal: 'create', id: null });
  }

  openEdit(material: Material): void {
    this.merge({ modal: 'edit', id: material.id });
  }

  closeModal(): void {
    this.merge({ modal: null, id: null });
  }

  toggleActive(material: Material): void {
    this.materials.update((list) =>
      list.map((m) => (m.id === material.id ? { ...m, isActive: !m.isActive } : m)),
    );
    this.confirm(`${material.name} ${material.isActive ? 'deactivated' : 'activated'}`);
  }

  save(): void {
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const name = value.name.trim();
    const editingId = this.modal() === 'edit' ? this.editingId() : null;
    const clash = this.materials().some(
      (m) => m.id !== editingId && m.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      this.serverError.set(`422 — a material named “${name}” already exists in the catalogue.`);
      return;
    }

    if (editingId) {
      this.materials.update((list) =>
        list.map((m) => (m.id === editingId ? { ...m, ...value, name } : m)),
      );
    } else {
      const nextId = `M${this.materials().length + 1}${Date.now().toString().slice(-3)}`;
      this.materials.update((list) => [...list, { id: nextId, ...value, name }]);
    }
    this.confirm(`${name} saved`);
    this.closeModal();
  }

  private confirm(message: string): void {
    this.savedMessage.set(message);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2600);
  }
}
