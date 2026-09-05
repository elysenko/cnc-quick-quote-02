import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigResolverService } from '../common/config.service';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counter store for rate limiting and refresh-token revocation.
 *
 * Redis is used when REDIS_URL is configured. When it is not, the limiter falls back
 * to an in-process window rather than disabling itself: a single-replica deployment
 * still gets real enforcement, and the only thing lost is cross-replica sharing.
 * This is a genuine degraded mode, not a stub — the counters are live either way.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private resolved = false;
  private readonly local = new Map<string, Window>();

  constructor(private readonly config: ConfigResolverService) {}

  private async connection(): Promise<Redis | null> {
    if (this.resolved) return this.client;
    this.resolved = true;
    const url = await this.config.resolveFirst('REDIS_URL', 'REDIS_API_KEY');
    if (!url || !/^rediss?:\/\//.test(url)) {
      this.logger.warn('REDIS_URL is not configured — rate limiting falls back to an in-process window.');
      return null;
    }
    try {
      this.client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false, enableOfflineQueue: false });
      this.client.on('error', (error) => this.logger.warn(`Redis error: ${error.message}`));
    } catch (error) {
      this.logger.warn(`Redis connection failed, using in-process limiter: ${(error as Error).message}`);
      this.client = null;
    }
    return this.client;
  }

  /**
   * Increments the counter for `key` inside a fixed window and returns the running
   * count plus seconds until the window resets (the value for `Retry-After`).
   */
  async incrementWindow(key: string, windowSeconds: number): Promise<{ count: number; resetSeconds: number }> {
    const redis = await this.connection();
    if (redis) {
      try {
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, windowSeconds);
        const ttl = await redis.ttl(key);
        return { count, resetSeconds: ttl > 0 ? ttl : windowSeconds };
      } catch (error) {
        this.logger.warn(`Redis incr failed, falling back in-process: ${(error as Error).message}`);
      }
    }
    return this.incrementLocal(key, windowSeconds);
  }

  private incrementLocal(key: string, windowSeconds: number): { count: number; resetSeconds: number } {
    const now = Date.now();
    const existing = this.local.get(key);
    if (!existing || existing.resetAt <= now) {
      const window: Window = { count: 1, resetAt: now + windowSeconds * 1000 };
      this.local.set(key, window);
      this.sweep(now);
      return { count: 1, resetSeconds: windowSeconds };
    }
    existing.count += 1;
    return { count: existing.count, resetSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  /** Drops elapsed windows so the in-process map cannot grow without bound. */
  private sweep(now: number): void {
    if (this.local.size < 512) return;
    for (const [key, window] of this.local) {
      if (window.resetAt <= now) this.local.delete(key);
    }
  }

  async check(): Promise<{ status: 'up' | 'down' | 'unconfigured'; message?: string }> {
    const redis = await this.connection();
    if (!redis) return { status: 'unconfigured', message: 'REDIS_URL not set; using in-process rate limiting.' };
    try {
      await redis.ping();
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', message: (error as Error).message };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}
