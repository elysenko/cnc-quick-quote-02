/**
 * Namespaced browser storage.
 *
 * Preview mockups are served many-per-origin under /<mockup-id>/ and storage is
 * origin-scoped, so every key is prefixed with the first URL path segment to keep
 * mockups from colliding with each other. Never touch localStorage directly.
 */
function resolveNamespace(): string {
  try {
    // The served base path — '/<mockup-id>/' under the preview host, '/' at the site
    // root. Deriving the namespace from the BASE (not the current route) keeps one
    // stable prefix per deployment instead of one per screen.
    const basePath = new URL(document.baseURI).pathname;
    return basePath.split('/').filter(Boolean)[0] || 'app';
  } catch {
    return 'app';
  }
}

const NS = resolveNamespace();

export const nsKey = (key: string): string => `${NS}:${key}`;

export function readJson<T>(key: string, isValid: (value: unknown) => boolean): T | null {
  try {
    const raw = localStorage.getItem(nsKey(key));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed)) {
      localStorage.removeItem(nsKey(key));
      return null;
    }
    return parsed as T;
  } catch {
    try {
      localStorage.removeItem(nsKey(key));
    } catch {
      /* storage unavailable — ignore */
    }
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(nsKey(key), JSON.stringify(value));
  } catch {
    /* quota or disabled storage — non-fatal for the UI */
  }
}

export function removeKeys(...keys: string[]): void {
  try {
    keys.forEach((k) => localStorage.removeItem(nsKey(k)));
  } catch {
    /* ignore */
  }
}
