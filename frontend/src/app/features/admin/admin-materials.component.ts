import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialApi } from '../../core/api/domain.service';
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
  private readonly materialApi = inject(MaterialApi);

  readonly materials = signal<Material[]>([]);

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
    void this.load();
    // The edit form is rebuilt whenever ?modal / ?id change. It also re-runs after
    // the catalogue arrives, because a deep link to ?modal=edit&id=… resolves before
    // the fetch completes and would otherwise prefill an empty form.
    effect(
      () => {
        const mode = this.modal();
        const id = this.editingId();
        this.materials();
        untracked(() => this.syncForm(mode, id));
      },
      { allowSignalWrites: true },
    );
  }

  /** Admin catalogue — unlike the customer endpoint this includes inactive rows. */
  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.materials.set(await this.materialApi.listAll());
    } catch (error) {
      this.loadError.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
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

  /**
   * Optimistic toggle with rollback — the row has no per-row spinner in the approved
   * design, so the flip must look instant and undo itself if the server refuses.
   */
  async toggleActive(material: Material): Promise<void> {
    const next = !material.isActive;
    this.materials.update((list) => list.map((m) => (m.id === material.id ? { ...m, isActive: next } : m)));
    try {
      const saved = await this.materialApi.update(material.id, { isActive: next });
      this.materials.update((list) => list.map((m) => (m.id === material.id ? saved : m)));
      this.confirm(`${material.name} ${next ? 'activated' : 'deactivated'}`);
    } catch (error) {
      this.materials.update((list) =>
        list.map((m) => (m.id === material.id ? { ...m, isActive: material.isActive } : m)),
      );
      this.serverError.set((error as Error).message);
    }
  }

  /**
   * Creates or updates the material. The duplicate-name rule is enforced by the
   * server (409); this only surfaces its message, so two admins racing on the same
   * name cannot both win.
   */
  async save(): Promise<void> {
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const name = value.name.trim();
    const editingId = this.modal() === 'edit' ? this.editingId() : null;
    try {
      if (editingId) {
        const saved = await this.materialApi.update(editingId, { ...value, name });
        this.materials.update((list) => list.map((m) => (m.id === editingId ? saved : m)));
      } else {
        const created = await this.materialApi.create({ ...value, name });
        this.materials.update((list) => [...list, created]);
      }
    } catch (error) {
      this.serverError.set((error as Error).message);
      return;
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
