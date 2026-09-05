import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { BrandingService } from '../../../core/branding.service';

/** Optional secret: blank keeps the stored value, otherwise it must look like a Stripe key. */
function optionalSecret(prefix: string) {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!value) return null;
    if (value.length < 12) return { short: true };
    return value.startsWith(prefix) ? null : { prefix: true };
  };
}

/** Stripe credentials. Write-only: stored secrets are never re-displayed in full. */
@Component({
  selector: 'app-admin-payment',
  imports: [ReactiveFormsModule],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentComponent {
  private readonly fb = inject(FormBuilder);
  private readonly branding = inject(BrandingService);

  readonly business = this.branding.settings;

  readonly saved = signal(false);
  readonly savedNote = signal('');
  readonly saveError = signal<string | null>(null);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    publishableKey: [
      this.business().stripePublishableKey,
      [Validators.required, Validators.minLength(12), Validators.pattern(/^pk_[A-Za-z0-9_]+$/)],
    ],
    secretKey: ['', [optionalSecret('sk_')]],
    webhookSecret: ['', [optionalSecret('whsec_')]],
  });

  readonly checkoutReady = computed(
    () => this.business().stripeSecretLast4.length > 0 && this.business().stripePublishableKey.length > 0,
  );

  readonly webhookReady = computed(() => this.business().stripeWebhookLast4.length > 0);

  async save(): Promise<void> {
    this.saveError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const secret = value.secretKey.trim();
    const webhook = value.webhookSecret.trim();
    const kept: string[] = [];
    if (!secret) kept.push('secret key');
    if (!webhook) kept.push('webhook signing secret');

    this.saving.set(true);
    try {
      await this.branding.save({
        stripePublishableKey: value.publishableKey.trim(),
        // Blank means "keep the stored secret" — the server only rotates when a
        // non-empty value is sent.
        ...(secret ? { stripeSecretKey: secret } : {}),
        ...(webhook ? { stripeWebhookSecret: webhook } : {}),
      });
    } catch (error) {
      this.saveError.set((error as Error).message);
      return;
    } finally {
      this.saving.set(false);
    }

    this.form.controls.secretKey.reset('');
    this.form.controls.webhookSecret.reset('');
    this.savedNote.set(
      kept.length > 0 ? `Saved — kept the stored ${kept.join(' and ')}.` : 'Saved — both secrets were rotated.',
    );
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 3200);
  }

  revert(): void {
    this.form.reset({
      publishableKey: this.business().stripePublishableKey,
      secretKey: '',
      webhookSecret: '',
    });
  }
}
