import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { readJson, removeKeys, writeJson } from './storage';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

/** Thrown for every non-2xx response, carrying the server's own message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const isString = (value: unknown): boolean => typeof value === 'string';

/**
 * Extracts a human-readable message from a NestJS error body. class-validator
 * returns `message` as an ARRAY of field errors, so the array form is joined rather
 * than stringified into "[object Object]".
 */
function messageOf(error: HttpErrorResponse): string {
  const body = error.error as { message?: string | string[] } | string | null;
  if (typeof body === 'string' && body.trim()) return body;
  const message = (body as { message?: string | string[] })?.message;
  if (Array.isArray(message)) return message.join(' ');
  if (typeof message === 'string' && message) return message;
  if (error.status === 0) return 'Could not reach the server. Check your connection and try again.';
  return error.message || 'Something went wrong. Please try again.';
}

/**
 * Thin REST client for the NestJS backend, mounted at /api (nginx proxies that
 * prefix to the API container; `ng serve` proxies it in development).
 *
 * Owns the access/refresh token pair: it attaches the bearer token, and on a 401
 * transparently attempts ONE refresh and replays the original request. A second
 * failure clears the session so the auth guard can redirect to /login.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';
  /** Shared across concurrent 401s so a burst of requests triggers one refresh. */
  private refreshInFlight: Promise<boolean> | null = null;

  accessToken(): string | null {
    return readJson<string>(ACCESS_KEY, isString);
  }

  refreshToken(): string | null {
    return readJson<string>(REFRESH_KEY, isString);
  }

  setTokens(accessToken: string, refreshToken: string): void {
    writeJson(ACCESS_KEY, accessToken);
    writeJson(REFRESH_KEY, refreshToken);
  }

  clearTokens(): void {
    removeKeys(ACCESS_KEY, REFRESH_KEY, 'user');
  }

  get<T>(path: string): Promise<T> {
    return this.send<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.send<T>('POST', path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.send<T>('PATCH', path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.send<T>('PUT', path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.send<T>('DELETE', path);
  }

  /** Multipart upload — the browser sets its own Content-Type boundary. */
  async upload<T>(path: string, form: FormData): Promise<T> {
    return this.send<T>('POST', path, form, true);
  }

  private headers(isForm: boolean): HttpHeaders {
    let headers = new HttpHeaders();
    if (!isForm) headers = headers.set('Content-Type', 'application/json');
    const token = this.accessToken();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    return headers;
  }

  private async send<T>(method: string, path: string, body?: unknown, isForm = false, retried = false): Promise<T> {
    try {
      return await firstValueFrom(
        this.http.request<T>(method, `${this.base}${path}`, {
          body,
          headers: this.headers(isForm),
          responseType: 'json',
        }),
      );
    } catch (caught) {
      const error = caught as HttpErrorResponse;
      // One transparent refresh-and-replay. `retried` stops an infinite loop when
      // the replayed request 401s again.
      if (error.status === 401 && !retried && !path.startsWith('/auth/')) {
        const refreshed = await this.tryRefresh();
        if (refreshed) return this.send<T>(method, path, body, isForm, true);
      }
      throw new ApiError(error.status, messageOf(error));
    }
  }

  private tryRefresh(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      const refreshToken = this.refreshToken();
      if (!refreshToken) return false;
      try {
        const pair = await firstValueFrom(
          this.http.post<{ accessToken: string; refreshToken: string }>(
            `${this.base}/auth/refresh`,
            { refreshToken },
            { headers: new HttpHeaders().set('Content-Type', 'application/json') },
          ),
        );
        this.setTokens(pair.accessToken, pair.refreshToken);
        return true;
      } catch {
        this.clearTokens();
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }
}
