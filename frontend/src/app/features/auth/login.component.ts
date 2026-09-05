import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './auth.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly business = inject(BrandingService).settings;

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly pending = signal(false);
  readonly error = signal<string | null>(null);
  readonly previewShortcut = this.auth.previewShortcut;
  readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

  /** Decorative nested-part placements for the sign-in artwork. */
  readonly art = [
    { x: 26, y: 26 },
    { x: 92, y: 26 },
    { x: 158, y: 26 },
    { x: 224, y: 26 },
    { x: 26, y: 94 },
    { x: 92, y: 94 },
    { x: 158, y: 94 },
    { x: 224, y: 94 },
  ];

  invalid(name: 'email' | 'password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  async submit(): Promise<void> {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.pending.set(true);
    const { email, password } = this.form.getRawValue();
    const result = await this.auth.login(email, password);
    this.pending.set(false);
    if (!result.ok) this.error.set(result.error ?? 'That email and password combination was not recognised.');
  }

  skipLogin(): void {
    void this.auth.previewSignIn();
  }
}
