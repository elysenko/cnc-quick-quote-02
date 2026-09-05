import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MOCK_INTEGRATIONS } from '../../core/mock/fixtures';
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

  // MOCK DATA — replace initializer with [] and load via API
  readonly integrations = signal<IntegrationSetting[]>(MOCK_INTEGRATIONS);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly savedKey = signal<string | null>(null);

  private readonly controls = new Map<string, FormControl<string>>();

  readonly services = computed(() => this.integrations().filter((i) => i.kind === 'service'));
  readonly thirdParty = computed(() => this.integrations().filter((i) => i.kind === 'integration'));
  readonly unconfigured = computed(() => this.integrations().filter((i) => !i.configured));

  /** Stable per-row credential control, created lazily on first render. */
  control(key: string): FormControl<string> {
    let existing = this.controls.get(key);
    if (!existing) {
      existing = this.fb.nonNullable.control('', [Validators.required, Validators.minLength(8)]);
      this.controls.set(key, existing);
    }
    return existing;
  }

  saveCredential(item: IntegrationSetting): void {
    const control = this.control(item.key);
    const value = control.value.trim();
    if (control.invalid || value.length < 8) {
      control.markAsTouched();
      control.updateValueAndValidity();
      return;
    }
    const masked = `••••${value.slice(-4)}`;
    this.integrations.update((list) =>
      list.map((i) => (i.key === item.key ? { ...i, configured: true, maskedValue: masked } : i)),
    );
    control.reset('');
    control.markAsUntouched();
    this.savedKey.set(item.key);
    setTimeout(() => {
      if (this.savedKey() === item.key) this.savedKey.set(null);
    }, 2600);
  }

  clearCredential(item: IntegrationSetting): void {
    this.integrations.update((list) =>
      list.map((i) => (i.key === item.key ? { ...i, configured: false, maskedValue: '' } : i)),
    );
    this.control(item.key).reset('');
    this.savedKey.set(null);
  }
}
