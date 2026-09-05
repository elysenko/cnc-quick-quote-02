import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Role, SessionUser } from './models';
import { ApiError, ApiService } from './api.service';
import { readJson, removeKeys, writeJson } from './storage';

const USER_KEY = 'user';
const TOKEN_KEY = 'access_token';

/** Preview-only stand-in session. Folded out of production bundles by COLOSSUS_PREVIEW. */
const PREVIEW_USER: SessionUser = {
  id: 'preview-user',
  email: 'owner@example.com',
  name: 'Preview User',
  role: 'ADMIN',
};

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  /** Set to 'email' when the failure belongs to a specific field (e.g. 409 duplicate). */
  field?: 'email';
}

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
  private readonly api = inject(ApiService);

  readonly user = signal<SessionUser | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  /** The account's createdAt, populated by refreshProfile(); drives "member since". */
  readonly memberSince = signal<string | null>(null);

  /** Preview-only affordance label; folded out of production bundles. */
  readonly previewShortcut = COLOSSUS_PREVIEW ? 'Skip login — Demo Mode' : '';

  constructor() {
    this.restore();
  }

  /**
   * Restores a session defensively: any unrecognised value is cleared, never thrown.
   * Restoring synchronously from storage is what lets a deep link render on a hard
   * refresh instead of bouncing through /login.
   */
  restore(): void {
    const stored = readJson<SessionUser>(USER_KEY, isSessionUser);
    if (stored && (COLOSSUS_PREVIEW || this.api.accessToken())) {
      this.user.set(stored);
      if (!COLOSSUS_PREVIEW) void this.refreshProfile();
      return;
    }
    removeKeys(USER_KEY, TOKEN_KEY);
    this.api.clearTokens();
    this.user.set(null);
  }

  /** Re-reads the account from the server so a role change lands without a re-login. */
  private async refreshProfile(): Promise<void> {
    try {
      const me = await this.api.get<SessionUser & { createdAt: string }>('/auth/me');
      this.user.set({ id: me.id, email: me.email, name: me.name, role: me.role });
      this.memberSince.set(me.createdAt);
      writeJson(USER_KEY, this.user());
    } catch (error) {
      // A 401 here means the refresh token is spent too — drop to signed-out.
      if (error instanceof ApiError && error.status === 401) {
        this.api.clearTokens();
        this.user.set(null);
      }
    }
  }

  async login(email: string, password: string): Promise<AuthResult> {
    if (COLOSSUS_PREVIEW) {
      if (!email.trim() || !password.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: 'Enter a valid email address and your password.' };
      }
      this.setPreviewSession({ ...PREVIEW_USER, email: email.trim() });
      await this.router.navigate(['/quotes']);
      return { ok: true };
    }
    try {
      const pair = await this.api.post<TokenPair>('/auth/login', { email: email.trim(), password });
      await this.adopt(pair);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as ApiError).message };
    }
  }

  async signup(name: string, email: string, password: string): Promise<AuthResult> {
    if (COLOSSUS_PREVIEW) {
      if (!email.trim() || password.length < 8) {
        return { ok: false, error: 'Enter a valid email and a password of at least 8 characters.' };
      }
      this.setPreviewSession({ ...PREVIEW_USER, email: email.trim(), name: name.trim() || null });
      await this.router.navigate(['/quotes']);
      return { ok: true };
    }
    try {
      const pair = await this.api.post<TokenPair>('/auth/register', {
        name: name.trim() || undefined,
        email: email.trim(),
        password,
      });
      await this.adopt(pair);
      return { ok: true };
    } catch (error) {
      const api = error as ApiError;
      // 409 is specifically "that email is taken" — show it on the email field.
      return { ok: false, error: api.message, field: api.status === 409 ? 'email' : undefined };
    }
  }

  /** Seeds the signed-in state directly — no credentials involved. */
  async previewSignIn(): Promise<void> {
    if (!COLOSSUS_PREVIEW) return;
    this.setPreviewSession(PREVIEW_USER);
    await this.router.navigate(['/quotes']);
  }

  /** Ensures a session exists so preview deep links render instead of bouncing to /login. */
  ensurePreviewSession(): void {
    if (COLOSSUS_PREVIEW && !this.user()) this.setPreviewSession(PREVIEW_USER);
  }

  /** Preview-only role switch so the customer-facing 403 view stays reviewable. */
  setRole(role: Role): void {
    if (!COLOSSUS_PREVIEW) return;
    const current = this.user();
    if (!current) return;
    this.setPreviewSession({ ...current, role });
  }

  async logout(): Promise<void> {
    const refreshToken = this.api.refreshToken();
    if (!COLOSSUS_PREVIEW && refreshToken) {
      // Best-effort revocation; the client signs out either way.
      await this.api.post('/auth/logout', { refreshToken }).catch(() => undefined);
    }
    this.api.clearTokens();
    removeKeys(USER_KEY, TOKEN_KEY);
    this.user.set(null);
    this.memberSince.set(null);
    await this.router.navigate(['/login']);
  }

  private async adopt(pair: TokenPair): Promise<void> {
    this.api.setTokens(pair.accessToken, pair.refreshToken);
    this.user.set(pair.user);
    writeJson(USER_KEY, pair.user);
    void this.refreshProfile();
    await this.router.navigate(['/quotes']);
  }

  private setPreviewSession(user: SessionUser): void {
    this.user.set(user);
    writeJson(USER_KEY, user);
    writeJson(TOKEN_KEY, 'preview-session');
  }
}
