import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Role, SessionUser } from './models';
import { MOCK_USER } from './mock/fixtures';
import { readJson, removeKeys, writeJson } from './storage';

const USER_KEY = 'user';
const TOKEN_KEY = 'access_token';

function isSessionUser(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u['id'] === 'string' &&
    typeof u['email'] === 'string' &&
    (u['role'] === 'USER' || u['role'] === 'MANAGER' || u['role'] === 'ADMIN')
  );
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  readonly user = signal<SessionUser | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');

  /** Preview-only affordance label; folded out of production bundles. */
  readonly previewShortcut = COLOSSUS_PREVIEW ? 'Skip login — Demo Mode' : '';

  constructor() {
    this.restore();
  }

  /** Restores a session defensively: any unrecognised value is cleared, never thrown. */
  restore(): void {
    const stored = readJson<SessionUser>(USER_KEY, isSessionUser);
    if (stored) {
      this.user.set(stored);
      return;
    }
    removeKeys(USER_KEY, TOKEN_KEY);
    this.user.set(null);
  }

  /**
   * Resolves credentials locally in preview builds (no server exists behind the
   * static preview host); the non-preview branch is the real API call.
   */
  async login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    if (COLOSSUS_PREVIEW) {
      if (!email.trim() || !password.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: 'Enter a valid email address and your password.' };
      }
      this.setSession({ ...MOCK_USER, email: email.trim() });
      await this.router.navigate(['/quotes']);
      return { ok: true };
    }
    return { ok: false, error: 'Sign-in is unavailable.' };
  }

  async signup(name: string, email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    if (COLOSSUS_PREVIEW) {
      if (!email.trim() || password.length < 8) {
        return { ok: false, error: 'Enter a valid email and a password of at least 8 characters.' };
      }
      this.setSession({ ...MOCK_USER, email: email.trim(), name: name.trim() || null });
      await this.router.navigate(['/quotes']);
      return { ok: true };
    }
    return { ok: false, error: 'Sign-up is unavailable.' };
  }

  /** Seeds the signed-in state directly — no credentials involved. */
  async previewSignIn(): Promise<void> {
    if (!COLOSSUS_PREVIEW) return;
    this.setSession(MOCK_USER);
    await this.router.navigate(['/quotes']);
  }

  /** Ensures a session exists so preview deep links render instead of bouncing to /login. */
  ensurePreviewSession(): void {
    if (COLOSSUS_PREVIEW && !this.user()) this.setSession(MOCK_USER);
  }

  /** Preview-only role switch so the customer-facing 403 view stays reviewable. */
  setRole(role: Role): void {
    const current = this.user();
    if (!current) return;
    this.setSession({ ...current, role });
  }

  async logout(): Promise<void> {
    removeKeys(USER_KEY, TOKEN_KEY);
    this.user.set(null);
    await this.router.navigate(['/login']);
  }

  private setSession(user: SessionUser): void {
    this.user.set(user);
    writeJson(USER_KEY, user);
    writeJson(TOKEN_KEY, 'preview-session');
  }
}
