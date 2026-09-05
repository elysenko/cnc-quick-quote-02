import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingsApi } from '../../core/api/domain.service';
import type { MachineSettings } from '../../core/models';

const BYTES_PER_MB = 1024 * 1024;
const EXT_PATTERN = /^\.[a-z0-9]{1,6}$/;

/**
 * Placeholder used only for the milliseconds before GET /admin/machine resolves.
 * Held at the lowest values the form accepts so a half-loaded form can never be
 * mistaken for real configured limits; load() overwrites it and resets the form
 * from the server's response.
 */
const NEUTRAL_MACHINE: MachineSettings = {
  sheetSpacingMm: 0,
  sheetMarginMm: 0,
  allowedExtensions: [],
  maxUploadBytes: BYTES_PER_MB / 2,
  animationSpeed: 1,
};

/** Nesting, upload and work-bed animation limits used by the quote engine. */
@Component({
  selector: 'app-admin-machine',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-machine.component.html',
  styleUrl: './admin-machine.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMachineComponent {
  private readonly fb = inject(FormBuilder);
  private readonly settingsApi = inject(SettingsApi);

  readonly machine = signal<MachineSettings>(NEUTRAL_MACHINE);
  readonly extensions = signal<string[]>([...NEUTRAL_MACHINE.allowedExtensions]);

  readonly saved = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly extError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    sheetSpacingMm: [NEUTRAL_MACHINE.sheetSpacingMm, [Validators.required, Validators.min(0), Validators.max(100)]],
    sheetMarginMm: [NEUTRAL_MACHINE.sheetMarginMm, [Validators.required, Validators.min(0), Validators.max(200)]],
    maxUploadMb: [NEUTRAL_MACHINE.maxUploadBytes / BYTES_PER_MB, [Validators.required, Validators.min(0.5), Validators.max(200)]],
    animationSpeed: [NEUTRAL_MACHINE.animationSpeed, [Validators.required, Validators.min(0.25), Validators.max(3)]],
  });

  readonly newExtension = this.fb.nonNullable.control('');

  readonly draft = signal(this.form.getRawValue());

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.draft.set(this.form.getRawValue()));
    // Subscribed first, so the reset inside load() also refreshes `draft`.
    void this.load();
  }

  readonly maxUploadBytes = computed(() => Math.round(this.draft().maxUploadMb * BYTES_PER_MB));

  readonly bytesLabel = computed(() => this.maxUploadBytes().toLocaleString('en-US'));

  readonly speedLabel = computed(() => `${this.draft().animationSpeed.toFixed(2)}×`);

  /** Usable area of a 1220 × 2440 sheet once the margin is deducted, for context. */
  readonly usableArea = computed(() => {
    const margin = this.draft().sheetMarginMm;
    return {
      width: Math.max(0, 1220 - margin * 2),
      height: Math.max(0, 2440 - margin * 2),
    };
  });

  addExtension(): void {
    const raw = this.newExtension.value.trim().toLowerCase();
    if (!raw) {
      this.extError.set('Type a file extension first, e.g. .dwg');
      return;
    }
    const ext = raw.startsWith('.') ? raw : `.${raw}`;
    if (!EXT_PATTERN.test(ext)) {
      this.extError.set('Use a dot followed by 1–6 letters or digits, e.g. .dxf');
      return;
    }
    if (this.extensions().includes(ext)) {
      this.extError.set(`${ext} is already allowed.`);
      return;
    }
    this.extensions.update((list) => [...list, ext]);
    this.newExtension.setValue('');
    this.extError.set(null);
  }

  removeExtension(ext: string): void {
    this.extensions.update((list) => list.filter((e) => e !== ext));
    this.extError.set(null);
  }

  /** Loads live machine settings, then reseeds the form (MB is a UI-only unit). */
  private async load(): Promise<void> {
    try {
      this.machine.set(await this.settingsApi.machine());
      this.revert();
    } catch (error) {
      this.saveError.set((error as Error).message);
    }
  }

  async save(): Promise<void> {
    this.saveError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Fix the highlighted fields before saving.');
      return;
    }
    if (this.extensions().length === 0) {
      this.saveError.set('Allow at least one file extension, otherwise no upload can succeed.');
      return;
    }
    const d = this.form.getRawValue();
    try {
      this.machine.set(
        await this.settingsApi.saveMachine({
          sheetSpacingMm: d.sheetSpacingMm,
          sheetMarginMm: d.sheetMarginMm,
          allowedExtensions: this.extensions(),
          maxUploadBytes: Math.round(d.maxUploadMb * BYTES_PER_MB),
          animationSpeed: d.animationSpeed,
        }),
      );
      this.revert();
    } catch (error) {
      this.saveError.set((error as Error).message);
      return;
    }
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2600);
  }

  revert(): void {
    const m = this.machine();
    this.saveError.set(null);
    this.extError.set(null);
    this.extensions.set([...m.allowedExtensions]);
    this.form.reset({
      sheetSpacingMm: m.sheetSpacingMm,
      sheetMarginMm: m.sheetMarginMm,
      maxUploadMb: m.maxUploadBytes / BYTES_PER_MB,
      animationSpeed: m.animationSpeed,
    });
  }
}
