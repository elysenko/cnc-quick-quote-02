import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './auth.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  readonly business = inject(BrandingService).settings;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', [Validators.required]],
  });

  readonly pending = signal(false);
  readonly error = signal<string | null>(null);
  readonly emailError = signal<string | null>(null);
  readonly previewShortcut = this.auth.previewShortcut;
  readonly art = [
    { x: 26, y: 26 },
    { x: 92, y: 26 },
    { x: 158, y: 26 },
    { x: 224, y: 26 },
  ];

  invalid(name: 'name' | 'email' | 'password' | 'confirm'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  mismatch(): boolean {
    const { password, confirm } = this.form.getRawValue();
    return confirm.length > 0 && password !== confirm;
  }

  async submit(): Promise<void> {
    this.error.set(null);
    this.emailError.set(null);
    if (this.form.invalid || this.mismatch()) {
      this.form.markAllAsTouched();
      return;
    }
    this.pending.set(true);
    const { name, email, password } = this.form.getRawValue();
    const result = await this.auth.signup(name, email, password);
    this.pending.set(false);
    if (!result.ok) {
      // A 409 is specifically "that email is taken" — show it on the field itself.
      if (result.field === 'email') this.emailError.set(result.error ?? null);
      else this.error.set(result.error ?? 'We could not create your account. Please try again.');
    }
  }

  skipSignup(): void {
    void this.auth.previewSignIn();
  }
}
