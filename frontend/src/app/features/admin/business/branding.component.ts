import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BrandingService } from '../../../core/branding.service';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Company identity + palette. Saving re-themes the whole app through BrandingService. */
@Component({
  selector: 'app-admin-branding',
  imports: [ReactiveFormsModule],
  templateUrl: './branding.component.html',
  styleUrl: './branding.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandingComponent {
  private readonly fb = inject(FormBuilder);
  private readonly branding = inject(BrandingService);

  // MOCK DATA — replace initializer with [] and load via API
  readonly business = this.branding.settings;

  readonly saved = signal(false);

  readonly form = this.fb.nonNullable.group({
    companyName: [this.business().companyName, [Validators.required, Validators.maxLength(60)]],
    logoUrl: [this.business().logoUrl],
    primaryColor: [this.business().primaryColor, [Validators.required, Validators.pattern(HEX)]],
    accentColor: [this.business().accentColor, [Validators.required, Validators.pattern(HEX)]],
  });

  readonly draft = signal(this.form.getRawValue());

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.draft.set(this.form.getRawValue()));
  }

  /** Falls back to the stored colour so the preview never renders an invalid value. */
  readonly previewPrimary = computed(() =>
    HEX.test(this.draft().primaryColor) ? this.draft().primaryColor : this.business().primaryColor,
  );

  readonly previewAccent = computed(() =>
    HEX.test(this.draft().accentColor) ? this.draft().accentColor : this.business().accentColor,
  );

  readonly initials = computed(() =>
    this.draft()
      .companyName.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join(''),
  );

  setPrimary(event: Event): void {
    this.form.controls.primaryColor.setValue((event.target as HTMLInputElement).value);
    this.form.controls.primaryColor.markAsDirty();
  }

  setAccent(event: Event): void {
    this.form.controls.accentColor.setValue((event.target as HTMLInputElement).value);
    this.form.controls.accentColor.markAsDirty();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.branding.update({
      companyName: value.companyName.trim(),
      logoUrl: value.logoUrl.trim(),
      primaryColor: value.primaryColor.toLowerCase(),
      accentColor: value.accentColor.toLowerCase(),
    });
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2600);
  }

  revert(): void {
    const b = this.business();
    this.form.reset({
      companyName: b.companyName,
      logoUrl: b.logoUrl,
      primaryColor: b.primaryColor,
      accentColor: b.accentColor,
    });
  }
}
