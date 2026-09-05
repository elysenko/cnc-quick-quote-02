import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingsApi } from '../../core/api/domain.service';
import type { IntegrationSetting } from '../../core/models';

/**
 * Integration + provisioned-service credentials. Secrets are write-only: a saved
 * value is only ever re-displayed masked to its last four characters.
 */
@Component({
  selector: 'app-admin-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly settingsApi = inject(SettingsApi);

  readonly integrations = signal<IntegrationSetting[]>([]);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly savedKey = signal<string | null>(null);
  readonly rowErrors = signal<Record<string, string>>({});
  readonly savingKeys = signal<Set<string>>(new Set());

  private readonly controls = new Map<string, FormControl<string>>();

  readonly services = computed(() => this.integrations().filter((i) => i.kind === 'service'));
  readonly thirdParty = computed(() => this.integrations().filter((i) => i.kind === 'integration'));
  readonly unconfigured = computed(() => this.integrations().filter((i) => !i.configured));

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.integrations.set(await this.settingsApi.integrations());
    } catch (error) {
      this.loadError.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Stable per-row credential control, created lazily on first render. */
  control(key: string): FormControl<string> {
    let existing = this.controls.get(key);
    if (!existing) {
      existing = this.fb.nonNullable.control('', [Validators.required, Validators.minLength(8)]);
      this.controls.set(key, existing);
    }
    return existing;
  }

  isSaving(key: string): boolean {
    return this.savingKeys().has(key);
  }

  rowError(key: string): string | null {
    return this.rowErrors()[key] ?? null;
  }

  private setRowError(key: string, message: string | null): void {
    this.rowErrors.update((errors) => {
      const next = { ...errors };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  private setSaving(key: string, saving: boolean): void {
    this.savingKeys.update((keys) => {
      const next = new Set(keys);
      if (saving) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async saveCredential(item: IntegrationSetting): Promise<void> {
    const control = this.control(item.key);
    const value = control.value.trim();
    if (control.invalid || value.length < 8) {
      control.markAsTouched();
      control.updateValueAndValidity();
      return;
    }
    this.setRowError(item.key, null);
    this.setSaving(item.key, true);
    try {
      const updated = await this.settingsApi.saveCredential(item.key, value);
      this.integrations.update((list) => list.map((i) => (i.key === item.key ? updated : i)));
      control.reset('');
      control.markAsUntouched();
      this.savedKey.set(item.key);
      setTimeout(() => {
        if (this.savedKey() === item.key) this.savedKey.set(null);
      }, 2600);
    } catch (error) {
      this.setRowError(item.key, (error as Error).message);
    } finally {
      this.setSaving(item.key, false);
    }
  }

  async clearCredential(item: IntegrationSetting): Promise<void> {
    this.setRowError(item.key, null);
    this.setSaving(item.key, true);
    try {
      const updated = await this.settingsApi.clearCredential(item.key);
      this.integrations.update((list) => list.map((i) => (i.key === item.key ? updated : i)));
      this.control(item.key).reset('');
      if (this.savedKey() === item.key) this.savedKey.set(null);
    } catch (error) {
      this.setRowError(item.key, (error as Error).message);
    } finally {
      this.setSaving(item.key, false);
    }
  }
}
