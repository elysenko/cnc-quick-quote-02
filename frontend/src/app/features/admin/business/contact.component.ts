import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BrandingService } from '../../../core/branding.service';

const PHONE = /^[+0-9][0-9\s()-]{6,24}$/;

/** Customer-facing contact block: shown on quotes and in the checkout fallback message. */
@Component({
  selector: 'app-admin-contact',
  imports: [ReactiveFormsModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent {
  private readonly fb = inject(FormBuilder);
  private readonly branding = inject(BrandingService);

  // MOCK DATA — replace initializer with [] and load via API
  readonly business = this.branding.settings;

  readonly saved = signal(false);

  readonly form = this.fb.nonNullable.group({
    contactEmail: [this.business().contactEmail, [Validators.required, Validators.email]],
    contactPhone: [this.business().contactPhone, [Validators.required, Validators.pattern(PHONE)]],
    addressLine1: [this.business().addressLine1, [Validators.required, Validators.maxLength(80)]],
    addressLine2: [this.business().addressLine2, [Validators.maxLength(80)]],
    supportHours: [this.business().supportHours, [Validators.required, Validators.maxLength(60)]],
  });

  readonly draft = signal(this.form.getRawValue());

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.draft.set(this.form.getRawValue()));
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    await this.branding.save({
      contactEmail: value.contactEmail.trim(),
      contactPhone: value.contactPhone.trim(),
      addressLine1: value.addressLine1.trim(),
      addressLine2: value.addressLine2.trim(),
      supportHours: value.supportHours.trim(),
    });
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2600);
  }

  revert(): void {
    const b = this.business();
    this.form.reset({
      contactEmail: b.contactEmail,
      contactPhone: b.contactPhone,
      addressLine1: b.addressLine1,
      addressLine2: b.addressLine2,
      supportHours: b.supportHours,
    });
  }
}
